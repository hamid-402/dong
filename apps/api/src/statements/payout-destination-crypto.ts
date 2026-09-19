import {
  decryptSecret,
  encryptSecret,
  resolveMasterKeyMaterial,
  type MasterKeyMaterial,
} from "../key-vault/vault-crypto.js";

const PREFIX = "enc:v1:";

export type PayoutDestinationEncryptionMode = "aes_gcm_v1" | "plaintext";

let cachedMaster: MasterKeyMaterial | null | undefined;

function masterOrNull(): MasterKeyMaterial | null {
  if (cachedMaster !== undefined) return cachedMaster;
  cachedMaster = resolveMasterKeyMaterial({
    env: process.env,
    cwd: process.cwd(),
  });
  return cachedMaster;
}

/** Test helper — clear cached master resolution. */
export function resetPayoutDestinationCryptoCache(): void {
  cachedMaster = undefined;
}

export function payoutDestinationEncryptionMode(): PayoutDestinationEncryptionMode {
  return masterOrNull() ? "aes_gcm_v1" : "plaintext";
}

/**
 * Encrypt destination for at-rest storage when master key is available.
 * Plaintext rows remain readable (additive migration of legacy values).
 */
export function sealPayoutDestination(
  workspaceId: string,
  plaintext: string,
): string {
  const master = masterOrNull();
  if (!master) return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext;
  const version = 1;
  const blob = encryptSecret({
    plaintext,
    name: `workspace-payout:${workspaceId}`,
    version,
    master,
  });
  return `${PREFIX}${JSON.stringify({ ...blob, version })}`;
}

/** Decrypt sealed destination; pass through legacy plaintext unchanged. */
export function openPayoutDestination(
  workspaceId: string,
  stored: string,
): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const master = masterOrNull();
  if (!master) {
    throw new Error("PAYOUT_DESTINATION_ENCRYPTED_BUT_NO_MASTER_KEY");
  }
  const raw = stored.slice(PREFIX.length);
  const parsed = JSON.parse(raw) as {
    ciphertext: string;
    wrappedDek: string;
    masterKeyVersion: number;
    version: number;
  };
  return decryptSecret({
    ciphertext: parsed.ciphertext,
    wrappedDek: parsed.wrappedDek,
    name: `workspace-payout:${workspaceId}`,
    version: parsed.version,
    masterKeyVersion: parsed.masterKeyVersion,
    master,
  });
}
