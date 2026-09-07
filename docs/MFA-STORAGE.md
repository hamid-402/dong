# MFA recovery codes

Recovery codes are stored with the same `hashToken` pipeline as other secrets (`mfa.service.ts` → `hashToken` on each code). Plaintext codes are shown **once** at setup response and never persisted.

Verified against dong-50 item 28.
