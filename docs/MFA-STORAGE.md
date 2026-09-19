# MFA storage

## Recovery codes

Recovery codes use the same `hashToken` pipeline as other secrets (`mfa.service.ts` → `hashToken` on each code). Plaintext codes are shown **once** at setup response and never persisted.

## TOTP secret (S10-07 + R10-06 rotation window)

- New enrollments store `totp_secret` as AES-256-GCM ciphertext with prefix `enc:v1:` + base64url(iv ‖ tag ‖ ciphertext).
- Key: `TOTP_ENCRYPTION_KEY` (64-char hex or 32-byte base64), else HKDF-SHA256 from `SESSION_SECRET` (`dang-totp` / `totp-secret-v1`).
- Rotation: set `TOTP_ENCRYPTION_KEY_PREVIOUS` so decrypt tries current then previous (`openTotpSecretWithKeyring`). Seal always uses current.
- Rows without the prefix are treated as legacy base32 plaintext (read-only compatibility).
- Helpers: `sealTotpSecret` / `openTotpSecret` / `resolveTotpEncryptionKeyring` in `@dang/contracts`.
- Runbook: `docs/ops/KEY-ROTATION.md`.

External Vault/KMS provider: still deferred (capabilities stay `env` / `env_with_rotation`, never claim `vault` until wired).

Verified against dong-50 item 28 (+ Stage 10 A2 / B2 slice 3).
