import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  resolveInternalJobSecrets as resolveInternalJobSecretsFromEnv,
  resolveTotpEncryptionKey,
  resolveTotpEncryptionKeyring,
  VAULT_SECRET_JOB_HMAC,
  VAULT_SECRET_SESSION,
  VAULT_SECRET_TOTP_KEY,
  type VaultRotateMasterResponse,
  type VaultRotateResponse,
  type VaultStatusResponse,
} from "@dang/contracts";
import { createLogger } from "@dang/observability";
import { loadAppEnv } from "@dang/config";
import { KEY_VAULT_STORE, type VaultStore } from "./key-vault.types.js";
import {
  createMasterKeyProvider,
  resolveMasterKeySource,
  type MasterKeyProvider,
  type MasterKeySource,
  MASTER_KEY_PROVIDER,
} from "./master-key-provider.js";
import {
  VAULT_ACCESS_LOG_STORE,
  type VaultAccessLogStore,
} from "./vault-access-log.types.js";
import {
  decryptSecret,
  encryptSecret,
  generateMasterKey,
  persistMasterKeyFile,
  rewrapDek,
  type MasterKeyMaterial,
} from "./vault-crypto.js";
import { setSessionPepperResolver } from "../auth/phone-hash.js";

const logger = createLogger("dang-api-key-vault");

const WELL_KNOWN = [
  VAULT_SECRET_TOTP_KEY,
  VAULT_SECRET_SESSION,
  VAULT_SECRET_JOB_HMAC,
] as const;

@Injectable()
export class KeyVaultService implements OnModuleInit {
  private master: MasterKeyMaterial | null = null;
  private sealed = true;
  /** Cached plaintext for sync consumers while unsealed. */
  private readonly cache = new Map<string, string>();
  /** Invalidates in-flight bootstrap after seal. */
  private epoch = 0;
  private ready: Promise<void> = Promise.resolve();
  private readonly masterKeyProvider: MasterKeyProvider;

  constructor(
    @Inject(KEY_VAULT_STORE) private readonly store: VaultStore,
    @Optional()
    @Inject(MASTER_KEY_PROVIDER)
    masterKeyProvider?: MasterKeyProvider,
    @Optional()
    @Inject(VAULT_ACCESS_LOG_STORE)
    private readonly accessLog?: VaultAccessLogStore,
  ) {
    this.masterKeyProvider = masterKeyProvider ?? createMasterKeyProvider();
  }

  onModuleInit(): void {
    this.ready = this.initialize();
  }

  /** Await initial unseal + well-known seed (tests / callers). */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Honest master-key source for capabilities. */
  masterKeySource(): MasterKeySource {
    return resolveMasterKeySource({
      provider: this.masterKeyProvider,
      hasMaterial: Boolean(this.master),
    });
  }

  private logAccess(
    secretRef: string,
    operation: "encrypt" | "decrypt",
  ): void {
    if (!this.accessLog) return;
    void this.accessLog
      .append({
        secretRef,
        operation,
        actorType: "system",
      })
      .catch((err: unknown) => {
        logger.warn("vault.access_log.persist_failed", {
          detail: err instanceof Error ? err.message : "unknown",
          secretRef,
          operation,
        });
      });
  }

  private async initialize(): Promise<void> {
    let material: MasterKeyMaterial | null = null;
    try {
      material = await this.masterKeyProvider.getCurrentKey();
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "unknown";
      logger.warn("master key provider failed; vault remains sealed", {
        source: this.masterKeyProvider.source,
        detail,
      });
    }
    if (material) {
      this.master = material;
      this.sealed = false;
      this.bindSessionPepper();
      const epoch = this.epoch;
      try {
        await this.bootstrapWellKnown(epoch);
      } catch (err: unknown) {
        if (epoch !== this.epoch || this.isSealed()) return;
        const detail = err instanceof Error ? err.message : "unknown";
        logger.warn("vault bootstrap incomplete", { detail });
      }
    } else {
      logger.warn(
        "Local key vault sealed — set DANG_MASTER_KEY (base64 32 bytes) or VAULT_ADDR+VAULT_TOKEN to unseal in production",
      );
    }
  }

  private bindSessionPepper(): void {
    if (this.isSealed()) {
      setSessionPepperResolver(null);
      return;
    }
    setSessionPepperResolver(() => this.resolveSessionSecretSync());
  }

  /** True when a vault store is wired (memory or postgres) — drives capabilities. */
  storeLive(): boolean {
    return true;
  }

  persistence(): "memory" | "postgres" {
    return this.store.persistence;
  }

  isSealed(): boolean {
    return this.sealed || !this.master;
  }

  async status(): Promise<VaultStatusResponse> {
    const meta = await this.store.listMeta();
    return {
      status: this.isSealed() ? "sealed" : "unsealed",
      storeLive: true,
      persistence: this.store.persistence,
      masterKeyVersion: this.master?.currentVersion ?? null,
      previousMasterKeyLoaded: Boolean(this.master?.previous),
      secretCount: meta.length,
      secrets: meta.map((m) => ({
        name: m.name,
        latestVersion: m.latestVersion,
        masterKeyVersion: m.masterKeyVersion,
        updatedAt: m.updatedAt.toISOString(),
      })),
    };
  }

  async seal(): Promise<VaultStatusResponse> {
    this.epoch += 1;
    this.master = null;
    this.sealed = true;
    this.cache.clear();
    this.bindSessionPepper();
    logger.info("local key vault sealed");
    return this.status();
  }

  async unseal(): Promise<VaultStatusResponse> {
    let material: MasterKeyMaterial | null = null;
    try {
      material = await this.masterKeyProvider.getCurrentKey();
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "unknown";
      throw new BadRequestException({
        type: "https://dang.local/problems/vault-unseal-failed",
        title: "Vault unseal failed",
        status: 400,
        detail: `Master key provider error (${this.masterKeyProvider.source}): ${detail}`,
      });
    }
    if (!material) {
      throw new BadRequestException({
        type: "https://dang.local/problems/vault-unseal-failed",
        title: "Vault unseal failed",
        status: 400,
        detail:
          "DANG_MASTER_KEY required (or non-prod .dang/master.key), or VAULT_ADDR+VAULT_TOKEN",
      });
    }
    this.master = material;
    this.sealed = false;
    this.bindSessionPepper();
    const epoch = this.epoch;
    await this.bootstrapWellKnown(epoch);
    return this.status();
  }

  private requireUnsealed(): MasterKeyMaterial {
    if (this.sealed || !this.master) {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/vault-sealed",
        title: "Vault sealed",
        status: 503,
        detail: "Local key vault is sealed; plaintext get denied",
      });
    }
    return this.master;
  }

  async put(name: string, plaintext: string): Promise<{ name: string; version: number }> {
    const master = this.requireUnsealed();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200) {
      throw new BadRequestException({
        type: "https://dang.local/problems/vault-bad-name",
        title: "Invalid secret name",
        status: 400,
        detail: "Secret name required (max 200)",
      });
    }
    const latest = await this.store.get(trimmed);
    const version = (latest?.version ?? 0) + 1;
    const blob = encryptSecret({
      plaintext,
      name: trimmed,
      version,
      master,
    });
    await this.store.put({
      name: trimmed,
      version,
      ciphertext: blob.ciphertext,
      wrappedDek: blob.wrappedDek,
      masterKeyVersion: blob.masterKeyVersion,
    });
    this.logAccess(`${trimmed}:v${version}`, "encrypt");
    this.cache.set(trimmed, plaintext);
    return { name: trimmed, version };
  }

  async get(name: string, version?: number): Promise<string> {
    const master = this.requireUnsealed();
    const row = await this.store.get(name.trim(), version);
    if (!row) {
      throw new BadRequestException({
        type: "https://dang.local/problems/vault-secret-missing",
        title: "Secret not found",
        status: 400,
        detail: `No vault secret named ${name}`,
      });
    }
    const plain = decryptSecret({
      ciphertext: row.ciphertext,
      wrappedDek: row.wrappedDek,
      name: row.name,
      version: row.version,
      masterKeyVersion: row.masterKeyVersion,
      master,
    });
    this.logAccess(`${row.name}:v${row.version}`, "decrypt");
    if (version === undefined) this.cache.set(row.name, plain);
    return plain;
  }

  /** Soft get — null when sealed, missing, or decrypt fails (env fallback path). */
  async tryGet(name: string): Promise<string | null> {
    if (this.isSealed()) return null;
    try {
      return await this.get(name);
    } catch {
      return null;
    }
  }

  /** Sync cache peek for peppers while unsealed. */
  peekCached(name: string): string | null {
    if (this.isSealed()) return null;
    return this.cache.get(name) ?? null;
  }

  async rotate(name: string): Promise<VaultRotateResponse> {
    const plain = await this.get(name);
    const latest = await this.store.get(name.trim());
    const previousVersion = latest?.version ?? 0;
    const put = await this.put(name, plain);
    return {
      name: put.name,
      previousVersion,
      version: put.version,
      masterKeyVersion: this.master!.currentVersion,
    };
  }

  async rotateMasterKey(): Promise<VaultRotateMasterResponse> {
    const from = this.requireUnsealed();
    const nextKey = generateMasterKey();
    const to: MasterKeyMaterial = {
      current: nextKey,
      currentVersion: from.currentVersion + 1,
      previous: from.current,
      previousVersion: from.currentVersion,
    };

    const all = await this.store.listAll();
    let rewrappedCount = 0;
    for (const row of all) {
      const wrapped = rewrapDek({
        wrappedDek: row.wrappedDek,
        name: row.name,
        version: row.version,
        from,
        to,
      });
      await this.store.updateWrappedDek(
        row.name,
        row.version,
        wrapped.wrappedDek,
        wrapped.masterKeyVersion,
      );
      rewrappedCount += 1;
    }

    this.master = to;
    if (!process.env.DANG_MASTER_KEY?.trim() && loadAppEnv().nodeEnv !== "production") {
      persistMasterKeyFile(process.cwd(), nextKey);
    }
    this.cache.clear();
    await this.warmCache();
    logger.info("vault master key rotated", {
      masterKeyVersion: to.currentVersion,
      rewrappedCount,
    });
    return {
      previousMasterKeyVersion: from.currentVersion,
      masterKeyVersion: to.currentVersion,
      rewrappedCount,
    };
  }

  private async warmCache(): Promise<void> {
    if (this.isSealed()) return;
    for (const name of WELL_KNOWN) {
      const plain = await this.tryGet(name);
      if (plain) this.cache.set(name, plain);
    }
  }

  /**
   * Seed well-known secrets from env when missing so TOTP / session / job HMAC
   * can read through the vault once it is live.
   */
  private async bootstrapWellKnown(epoch = this.epoch): Promise<void> {
    if (this.isSealed() || epoch !== this.epoch) return;
    const env = process.env;

    const totp =
      env.TOTP_ENCRYPTION_KEY?.trim() ||
      resolveTotpEncryptionKey(env).toString("base64");
    if (epoch !== this.epoch) return;
    if (!(await this.store.get(VAULT_SECRET_TOTP_KEY))) {
      if (epoch !== this.epoch || this.isSealed()) return;
      await this.put(VAULT_SECRET_TOTP_KEY, totp);
    }

    if (epoch !== this.epoch || this.isSealed()) return;
    const session =
      env.SESSION_SECRET?.trim() || loadAppEnv().sessionSecret || "dev-only-session-secret-change-me";
    if (!(await this.store.get(VAULT_SECRET_SESSION))) {
      if (epoch !== this.epoch || this.isSealed()) return;
      await this.put(VAULT_SECRET_SESSION, session);
    }

    if (epoch !== this.epoch || this.isSealed()) return;
    const job = env.DANG_INTERNAL_JOB_TOKEN?.trim();
    if (job && !(await this.store.get(VAULT_SECRET_JOB_HMAC))) {
      if (epoch !== this.epoch || this.isSealed()) return;
      await this.put(VAULT_SECRET_JOB_HMAC, job);
    }

    if (epoch !== this.epoch || this.isSealed()) return;
    await this.warmCache();
  }

  /** Prefer vault TOTP key material; fall back to env keyring. */
  async resolveTotpKeyMaterial(): Promise<{
    current: Buffer;
    previous?: Buffer;
  }> {
    const fromVault = await this.tryGet(VAULT_SECRET_TOTP_KEY);
    if (fromVault) {
      const versions = await this.store.listVersions(VAULT_SECRET_TOTP_KEY);
      const current = decodeKeyLike(fromVault);
      let previous: Buffer | undefined;
      if (versions.length > 1 && !this.isSealed() && this.master) {
        try {
          const prevPlain = decryptSecret({
            ciphertext: versions[1]!.ciphertext,
            wrappedDek: versions[1]!.wrappedDek,
            name: versions[1]!.name,
            version: versions[1]!.version,
            masterKeyVersion: versions[1]!.masterKeyVersion,
            master: this.master,
          });
          this.logAccess(
            `${versions[1]!.name}:v${versions[1]!.version}`,
            "decrypt",
          );
          previous = decodeKeyLike(prevPlain);
        } catch {
          previous = undefined;
        }
      }
      const prevEnv = process.env.TOTP_ENCRYPTION_KEY_PREVIOUS?.trim();
      if (!previous && prevEnv) previous = decodeKeyLike(prevEnv);
      return previous && !previous.equals(current)
        ? { current, previous }
        : { current };
    }
    return resolveTotpEncryptionKeyring(process.env);
  }

  async resolveInternalJobSecrets(): Promise<string[]> {
    const secrets: string[] = [];
    const current = await this.tryGet(VAULT_SECRET_JOB_HMAC);
    if (current) secrets.push(current);
    if (!this.isSealed() && this.master) {
      const versions = await this.store.listVersions(VAULT_SECRET_JOB_HMAC);
      if (versions.length > 1) {
        try {
          const prev = decryptSecret({
            ciphertext: versions[1]!.ciphertext,
            wrappedDek: versions[1]!.wrappedDek,
            name: versions[1]!.name,
            version: versions[1]!.version,
            masterKeyVersion: versions[1]!.masterKeyVersion,
            master: this.master,
          });
          this.logAccess(
            `${versions[1]!.name}:v${versions[1]!.version}`,
            "decrypt",
          );
          if (prev && prev !== current) secrets.push(prev);
        } catch {
          /* ignore */
        }
      }
    }
    for (const s of resolveInternalJobSecretsFromEnv(process.env)) {
      if (!secrets.includes(s)) secrets.push(s);
    }
    return secrets;
  }

  async resolveSessionSecret(): Promise<string> {
    const fromVault = await this.tryGet(VAULT_SECRET_SESSION);
    if (fromVault) return fromVault;
    return loadAppEnv().sessionSecret || "dev-only-session-secret-change-me";
  }

  /** Sync session pepper — vault cache, else env. */
  resolveSessionSecretSync(): string {
    const cached = this.peekCached(VAULT_SECRET_SESSION);
    if (cached) return cached;
    return loadAppEnv().sessionSecret || "dev-only-session-secret-change-me";
  }
}

function decodeKeyLike(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return b64;
  } catch {
    /* fall through */
  }
  return resolveTotpEncryptionKey({ TOTP_ENCRYPTION_KEY: trimmed });
}
