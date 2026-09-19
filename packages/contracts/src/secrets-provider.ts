/**
 * Honest secrets-provider mode for capabilities (R10-06).
 * External Vault/KMS remains optional — local_vault_v1 is the in-repo deep path.
 */

export type SecretsProviderMode = "env" | "env_with_rotation" | "local_vault_v1";

export function resolveSecretsProviderMode(
  env: {
    TOTP_ENCRYPTION_KEY_PREVIOUS?: string;
    DANG_INTERNAL_JOB_TOKEN_PREVIOUS?: string;
  },
  options?: { vaultStoreLive?: boolean },
): SecretsProviderMode {
  if (options?.vaultStoreLive) return "local_vault_v1";
  if (
    env.TOTP_ENCRYPTION_KEY_PREVIOUS?.trim() ||
    env.DANG_INTERNAL_JOB_TOKEN_PREVIOUS?.trim()
  ) {
    return "env_with_rotation";
  }
  return "env";
}
