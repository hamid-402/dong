/**
 * Master key source abstraction (Phase 2.1).
 * AEAD stays in vault-crypto; only where the master key comes from changes.
 */
import { createLogger } from "@dang/observability";
import {
  decodeMasterKeyBase64,
  masterKeysEqual,
  resolveMasterKeyMaterial,
  VaultCryptoError,
  type MasterKeyMaterial,
} from "./vault-crypto.js";

const logger = createLogger("dang-api-master-key");

/** 3s hard timeout for Vault HTTP fetch (fail closed). */
const HTTP_VAULT_FETCH_TIMEOUT_MS = 3000;

export type MasterKeySource = "env" | "http_vault" | "none" | "plaintext";

export interface MasterKeyProvider {
  /** Honest capability label for this provider (configured source, not seal state). */
  readonly source: "env" | "http_vault";
  getCurrentKey(): Promise<MasterKeyMaterial | null>;
}

/** MVP: DANG_MASTER_KEY / PREVIOUS, or non-prod `.dang/master.key`. */
export class EnvMasterKeyProvider implements MasterKeyProvider {
  readonly source = "env" as const;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly cwd: string = process.cwd(),
  ) {}

  async getCurrentKey(): Promise<MasterKeyMaterial | null> {
    return resolveMasterKeyMaterial({
      env: this.env,
      cwd: this.cwd,
      warn: (message) => logger.warn(message),
    });
  }
}

/**
 * Optional HashiCorp Vault KV v2 HTTP reader.
 * Preferred only when ENABLE_HTTP_VAULT_MASTER_KEY=1 and VAULT_ADDR + VAULT_TOKEN
 * are set (ADR: env remains default). Fail closed on fetch/timeout/status errors.
 * Path: VAULT_MASTER_KEY_PATH (default `secret/data/dang/master-key`).
 * Expects secret field `key` = base64 of 32 raw bytes.
 */
export class HttpVaultMasterKeyProvider implements MasterKeyProvider {
  readonly source = "http_vault" as const;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env.VAULT_ADDR?.trim() && env.VAULT_TOKEN?.trim());
  }

  /** Opt-in gate aligned with ADR — HTTP Vault is not preferred by default. */
  static isPreferred(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.ENABLE_HTTP_VAULT_MASTER_KEY === "1" && this.isConfigured(env);
  }

  async getCurrentKey(): Promise<MasterKeyMaterial | null> {
    const addr = this.env.VAULT_ADDR?.trim().replace(/\/+$/, "");
    const token = this.env.VAULT_TOKEN?.trim();
    if (!addr || !token) return null;

    const path =
      this.env.VAULT_MASTER_KEY_PATH?.trim() || "secret/data/dang/master-key";
    const url = `${addr}/v1/${path.replace(/^\/+/, "")}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          "X-Vault-Token": token,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(HTTP_VAULT_FETCH_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : "unknown";
      throw new VaultCryptoError(`VAULT_HTTP_FETCH_FAILED:${detail}`);
    }

    if (!res.ok) {
      throw new VaultCryptoError(`VAULT_HTTP_STATUS_${res.status}`);
    }

    const body = (await res.json()) as {
      data?: { data?: { key?: string; previous?: string } };
    };
    const keyRaw = body.data?.data?.key?.trim();
    if (!keyRaw) {
      throw new VaultCryptoError("VAULT_HTTP_KEY_MISSING");
    }

    const current = decodeMasterKeyBase64(keyRaw);
    const material: MasterKeyMaterial = { current, currentVersion: 1 };
    const prevRaw = body.data?.data?.previous?.trim();
    if (prevRaw) {
      const previous = decodeMasterKeyBase64(prevRaw);
      if (!masterKeysEqual(previous, current)) {
        material.previous = previous;
        material.previousVersion = 0;
      }
    }
    return material;
  }
}

/**
 * Prefer HTTP Vault only when ENABLE_HTTP_VAULT_MASTER_KEY=1 and VAULT_* set;
 * else env/file MVP (ADR default).
 */
export function createMasterKeyProvider(
  env: NodeJS.ProcessEnv = process.env,
): MasterKeyProvider {
  if (HttpVaultMasterKeyProvider.isPreferred(env)) {
    return new HttpVaultMasterKeyProvider(env);
  }
  return new EnvMasterKeyProvider(env);
}

/**
 * Honest capability value: configured provider source when a key is (or will be)
 * loaded from that provider; `none` when sealed/unavailable; `plaintext` only
 * when no provider material and callers may store unsealed fields.
 */
export function resolveMasterKeySource(input: {
  provider: MasterKeyProvider;
  hasMaterial: boolean;
}): MasterKeySource {
  if (input.hasMaterial) {
    return input.provider.source === "http_vault" ? "http_vault" : "env";
  }
  if (input.provider.source === "http_vault") {
    // Configured for Vault but currently sealed / fetch not yet successful.
    return "http_vault";
  }
  return "none";
}

export const MASTER_KEY_PROVIDER = Symbol("MASTER_KEY_PROVIDER");
