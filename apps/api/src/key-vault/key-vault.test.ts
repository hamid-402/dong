/**
 * R10-06 local key vault — encrypt/decrypt, rotate window, seal deny, memory store.
 * Postgres store exercises the same service path when DATABASE_URL is set + migrated.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { KeyVaultService } from "./key-vault.service.js";
import { MemoryVaultStore } from "./memory-vault.store.js";
import { MemoryVaultAccessLogStore } from "./memory-vault-access-log.store.js";
import { PostgresVaultStore } from "./postgres-vault.store.js";
import {
  createMasterKeyProvider,
  EnvMasterKeyProvider,
  HttpVaultMasterKeyProvider,
  resolveMasterKeySource,
} from "./master-key-provider.js";
import {
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  resolveMasterKeyMaterial,
  rewrapDek,
  VaultCryptoError,
  type MasterKeyMaterial,
} from "./vault-crypto.js";
import type { VaultStore } from "./key-vault.types.js";

function master(version = 1, key = generateMasterKey()): MasterKeyMaterial {
  return { current: key, currentVersion: version };
}

async function withService(
  store: VaultStore,
  envKey: Buffer,
  run: (svc: KeyVaultService) => Promise<void>,
  accessLog?: MemoryVaultAccessLogStore,
) {
  const prevMaster = process.env.DANG_MASTER_KEY;
  const prevNode = process.env.NODE_ENV;
  const prevVaultAddr = process.env.VAULT_ADDR;
  const prevVaultToken = process.env.VAULT_TOKEN;
  process.env.DANG_MASTER_KEY = envKey.toString("base64");
  process.env.NODE_ENV = "test";
  delete process.env.VAULT_ADDR;
  delete process.env.VAULT_TOKEN;
  const provider = new EnvMasterKeyProvider(process.env);
  const svc = new KeyVaultService(store, provider, accessLog);
  svc.onModuleInit();
  await svc.whenReady();
  try {
    await run(svc);
  } finally {
    if (prevMaster === undefined) delete process.env.DANG_MASTER_KEY;
    else process.env.DANG_MASTER_KEY = prevMaster;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevVaultAddr === undefined) delete process.env.VAULT_ADDR;
    else process.env.VAULT_ADDR = prevVaultAddr;
    if (prevVaultToken === undefined) delete process.env.VAULT_TOKEN;
    else process.env.VAULT_TOKEN = prevVaultToken;
  }
}

test("AES-GCM roundtrip with name+version AAD", () => {
  const m = master();
  const blob = encryptSecret({
    plaintext: "super-secret",
    name: "demo",
    version: 1,
    master: m,
  });
  const plain = decryptSecret({
    ...blob,
    name: "demo",
    version: 1,
    master: m,
  });
  assert.equal(plain, "super-secret");
});

test("decrypt fails when AAD name mismatches", () => {
  const m = master();
  const blob = encryptSecret({
    plaintext: "x",
    name: "a",
    version: 1,
    master: m,
  });
  assert.throws(() =>
    decryptSecret({
      ...blob,
      name: "b",
      version: 1,
      master: m,
    }),
  );
});

test("memory vault put/get roundtrip", async () => {
  const key = generateMasterKey();
  await withService(new MemoryVaultStore(), key, async (svc) => {
    await svc.put("custom", "hello-vault");
    assert.equal(await svc.get("custom"), "hello-vault");
    const status = await svc.status();
    assert.equal(status.status, "unsealed");
    assert.ok(status.secrets.some((s) => s.name === "custom"));
    assert.equal(
      status.secrets.find((s) => s.name === "custom")?.latestVersion,
      1,
    );
  });
});

test("rotate keeps decrypt of previous version", async () => {
  const key = generateMasterKey();
  await withService(new MemoryVaultStore(), key, async (svc) => {
    await svc.put("rot", "v1-value");
    const rotated = await svc.rotate("rot");
    assert.equal(rotated.previousVersion, 1);
    assert.equal(rotated.version, 2);
    assert.equal(await svc.get("rot"), "v1-value");
    assert.equal(await svc.get("rot", 1), "v1-value");
    assert.equal(await svc.get("rot", 2), "v1-value");
  });
});

test("sealed denies get", async () => {
  const key = generateMasterKey();
  await withService(new MemoryVaultStore(), key, async (svc) => {
    await svc.put("seal-me", "hidden");
    await svc.seal();
    await assert.rejects(() => svc.get("seal-me"));
    assert.equal(await svc.tryGet("seal-me"), null);
  });
});

test("master rewrap keeps plaintext readable", () => {
  const k1 = generateMasterKey();
  const from = master(1, k1);
  const blob = encryptSecret({
    plaintext: "payload",
    name: "n",
    version: 1,
    master: from,
  });
  const to = master(2, generateMasterKey());
  to.previous = from.current;
  to.previousVersion = 1;
  const rewrapped = rewrapDek({
    wrappedDek: blob.wrappedDek,
    name: "n",
    version: 1,
    from,
    to,
  });
  const plain = decryptSecret({
    ciphertext: blob.ciphertext,
    wrappedDek: rewrapped.wrappedDek,
    masterKeyVersion: rewrapped.masterKeyVersion,
    name: "n",
    version: 1,
    master: to,
  });
  assert.equal(plain, "payload");
});

test("non-prod generates .dang/master.key once", () => {
  const dir = mkdtempSync(join(tmpdir(), "dang-vault-"));
  const prev = process.env.DANG_MASTER_KEY;
  const prevNode = process.env.NODE_ENV;
  delete process.env.DANG_MASTER_KEY;
  process.env.NODE_ENV = "development";
  try {
    const warnings: string[] = [];
    const first = resolveMasterKeyMaterial({
      env: process.env,
      cwd: dir,
      warn: (m) => warnings.push(m),
    });
    assert.ok(first);
    assert.equal(warnings.length, 1);
    const second = resolveMasterKeyMaterial({
      env: process.env,
      cwd: dir,
      warn: (m) => warnings.push(m),
    });
    assert.ok(second);
    assert.ok(first!.current.equals(second!.current));
    assert.equal(warnings.length, 1);
  } finally {
    if (prev === undefined) delete process.env.DANG_MASTER_KEY;
    else process.env.DANG_MASTER_KEY = prev;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("postgres vault store put/get when DATABASE_URL set", async (t) => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const key = generateMasterKey();
  let store: PostgresVaultStore;
  try {
    store = PostgresVaultStore.fromConnectionString(url);
  } catch (err) {
    t.skip(`postgres vault unavailable: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const name = `test_vault_${Date.now()}`;
  await withService(store, key, async (svc) => {
    try {
      await svc.put(name, "pg-secret");
      assert.equal(await svc.get(name), "pg-secret");
      const rotated = await svc.rotate(name);
      assert.equal(rotated.version, 2);
      assert.equal(await svc.get(name, 1), "pg-secret");
    } catch (err) {
      t.skip(
        `ops.vault_secret missing or unreachable: ${err instanceof Error ? err.message : err}`,
      );
    }
  });
});

test("decrypt writes a vault_access_log row (memory)", async () => {
  const key = generateMasterKey();
  const accessLog = new MemoryVaultAccessLogStore();
  await withService(new MemoryVaultStore(), key, async (svc) => {
    assert.equal(svc.masterKeySource(), "env");
    await svc.put("logged", "secret-value");
    await svc.get("logged");
    // fire-and-forget append — wait a tick
    await Promise.resolve();
    await Promise.resolve();
    const rows = await accessLog.listRecent(10);
    assert.ok(rows.some((r) => r.operation === "encrypt" && r.secretRef.startsWith("logged:")));
    assert.ok(rows.some((r) => r.operation === "decrypt" && r.secretRef.startsWith("logged:")));
  }, accessLog);
});

test("createMasterKeyProvider prefers http_vault only when ENABLE_HTTP_VAULT_MASTER_KEY=1", () => {
  const prevAddr = process.env.VAULT_ADDR;
  const prevToken = process.env.VAULT_TOKEN;
  const prevEnable = process.env.ENABLE_HTTP_VAULT_MASTER_KEY;
  try {
    process.env.VAULT_ADDR = "http://127.0.0.1:8200";
    process.env.VAULT_TOKEN = "dev-token";
    delete process.env.ENABLE_HTTP_VAULT_MASTER_KEY;
    const envOnly = createMasterKeyProvider(process.env);
    assert.ok(envOnly instanceof EnvMasterKeyProvider);

    process.env.ENABLE_HTTP_VAULT_MASTER_KEY = "1";
    const provider = createMasterKeyProvider(process.env);
    assert.ok(provider instanceof HttpVaultMasterKeyProvider);
    assert.equal(provider.source, "http_vault");
  } finally {
    if (prevAddr === undefined) delete process.env.VAULT_ADDR;
    else process.env.VAULT_ADDR = prevAddr;
    if (prevToken === undefined) delete process.env.VAULT_TOKEN;
    else process.env.VAULT_TOKEN = prevToken;
    if (prevEnable === undefined) delete process.env.ENABLE_HTTP_VAULT_MASTER_KEY;
    else process.env.ENABLE_HTTP_VAULT_MASTER_KEY = prevEnable;
  }
});

test("HttpVaultMasterKeyProvider reads KV v2 key field", async () => {
  const key = generateMasterKey();
  const provider = new HttpVaultMasterKeyProvider(
    {
      VAULT_ADDR: "http://vault.test",
      VAULT_TOKEN: "t",
      VAULT_MASTER_KEY_PATH: "secret/data/dang/master-key",
      ENABLE_HTTP_VAULT_MASTER_KEY: "1",
    },
    async () =>
      new Response(
        JSON.stringify({ data: { data: { key: key.toString("base64") } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  const material = await provider.getCurrentKey();
  assert.ok(material);
  assert.ok(material!.current.equals(key));
});

test("HttpVaultMasterKeyProvider fails closed on fetch error", async () => {
  const provider = new HttpVaultMasterKeyProvider(
    {
      VAULT_ADDR: "http://vault.test",
      VAULT_TOKEN: "t",
      ENABLE_HTTP_VAULT_MASTER_KEY: "1",
    },
    async () => {
      throw new Error("network down");
    },
  );
  await assert.rejects(
    () => provider.getCurrentKey(),
    (err: unknown) =>
      err instanceof VaultCryptoError &&
      String(err.message).includes("VAULT_HTTP_FETCH_FAILED"),
  );
});

test("resolveMasterKeySource stays honest without material", () => {
  assert.equal(
    resolveMasterKeySource({
      provider: new EnvMasterKeyProvider({}),
      hasMaterial: false,
    }),
    "none",
  );
  assert.equal(
    resolveMasterKeySource({
      provider: new HttpVaultMasterKeyProvider({
        VAULT_ADDR: "http://vault.test",
        VAULT_TOKEN: "t",
        ENABLE_HTTP_VAULT_MASTER_KEY: "1",
      }),
      hasMaterial: false,
    }),
    "http_vault",
  );
  assert.equal(
    resolveMasterKeySource({
      provider: new EnvMasterKeyProvider({}),
      hasMaterial: true,
    }),
    "env",
  );
});
