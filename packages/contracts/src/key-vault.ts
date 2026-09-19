/**
 * Local Key Vault (R10-06 depth) — in-repo AES-GCM vault, not HashiCorp/cloud.
 */

/** Well-known secret names consumed by auth / jobs when vault is live. */
export const VAULT_SECRET_TOTP_KEY = "totp_encryption_key";
export const VAULT_SECRET_SESSION = "session_secret";
export const VAULT_SECRET_JOB_HMAC = "internal_job_hmac";

export type VaultSealStatus = "unsealed" | "sealed";

export type VaultSecretMeta = {
  name: string;
  latestVersion: number;
  masterKeyVersion: number;
  updatedAt: string;
};

export type VaultStatusResponse = {
  status: VaultSealStatus;
  /** True when a durable or memory vault store is wired (not env-only). */
  storeLive: boolean;
  persistence: "memory" | "postgres";
  masterKeyVersion: number | null;
  previousMasterKeyLoaded: boolean;
  secretCount: number;
  secrets: VaultSecretMeta[];
};

export type VaultRotateResponse = {
  name: string;
  previousVersion: number;
  version: number;
  masterKeyVersion: number;
};

export type VaultRotateMasterResponse = {
  previousMasterKeyVersion: number;
  masterKeyVersion: number;
  rewrappedCount: number;
};
