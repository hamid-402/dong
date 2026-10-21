/**
 * RES-01 — HttpVault master key opt-in honesty (mock fetch, no network).
 * Staging checklist remains open until capabilities show masterKeySource=http_vault.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createMasterKeyProvider,
  EnvMasterKeyProvider,
  HttpVaultMasterKeyProvider,
  resolveMasterKeySource,
} from "./master-key-provider.js";
import { generateMasterKey, VaultCryptoError } from "./vault-crypto.js";

test("RES-01: without ENABLE_HTTP_VAULT_MASTER_KEY=1, source is never http_vault", () => {
  const env: NodeJS.ProcessEnv = {
    VAULT_ADDR: "http://127.0.0.1:8200",
    VAULT_TOKEN: "dev-token-placeholder",
  };
  const provider = createMasterKeyProvider(env);
  assert.ok(provider instanceof EnvMasterKeyProvider);
  assert.notEqual(provider.source, "http_vault");
  assert.equal(
    resolveMasterKeySource({ provider, hasMaterial: true }),
    "env",
  );
  assert.equal(
    resolveMasterKeySource({ provider, hasMaterial: false }),
    "none",
  );
});

test("RES-01: flag + mock success → source http_vault and resolveMasterKeySource honest", async () => {
  const key = generateMasterKey();
  const env: NodeJS.ProcessEnv = {
    ENABLE_HTTP_VAULT_MASTER_KEY: "1",
    VAULT_ADDR: "http://vault.test",
    VAULT_TOKEN: "t",
    VAULT_MASTER_KEY_PATH: "secret/data/dang/master-key",
  };
  const provider = createMasterKeyProvider(env);
  assert.ok(provider instanceof HttpVaultMasterKeyProvider);
  assert.equal(provider.source, "http_vault");

  const http = new HttpVaultMasterKeyProvider(env, async () =>
    new Response(
      JSON.stringify({ data: { data: { key: key.toString("base64") } } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const material = await http.getCurrentKey();
  assert.ok(material);
  assert.equal(
    resolveMasterKeySource({ provider: http, hasMaterial: true }),
    "http_vault",
  );
  assert.equal(
    resolveMasterKeySource({ provider: http, hasMaterial: false }),
    "http_vault",
  );
});

test("RES-01: fail-closed on fetch error (VAULT_HTTP_FETCH_FAILED)", async () => {
  const provider = new HttpVaultMasterKeyProvider(
    {
      ENABLE_HTTP_VAULT_MASTER_KEY: "1",
      VAULT_ADDR: "http://vault.test",
      VAULT_TOKEN: "t",
    },
    async () => {
      throw new Error("ECONNREFUSED");
    },
  );
  await assert.rejects(
    () => provider.getCurrentKey(),
    (err: unknown) =>
      err instanceof VaultCryptoError &&
      String(err.message).includes("VAULT_HTTP_FETCH_FAILED"),
  );
});
