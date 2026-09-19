# ADR: Master key delivery (Env vs HTTP Vault)

## Status

Accepted (interim)

## Context

The local key vault (`apps/api/src/key-vault`) wraps DEKs under a master key
(`DANG_MASTER_KEY`, optional `DANG_MASTER_KEY_PREVIOUS`, non-prod `.dang/master.key`).
We need a clear choice between:

1. **Env / file** — operator supplies the master key via environment (or local file in
   non-prod).
2. **HTTP Vault** — fetch the master key (or unwrap) from an external Vault/KMS HTTP API
   at boot or on rotate.

Today secrets already resolve through the in-process vault store (memory/Postgres) once
unsealed; the open question is only how the **master key itself** arrives.

## Decision

**For now: Env (and non-prod local file).** Do not call an external HTTP Vault/KMS for the
master key unless operators explicitly opt in.

Rationale:

- Honest ops surface: seal/unseal and rotate already work with `DANG_MASTER_KEY`.
- Fewer runtime dependencies and failure modes in local/CI and early production.
- Additive path: `HttpVaultMasterKeyProvider` exists behind
  `ENABLE_HTTP_VAULT_MASTER_KEY=1` + `VAULT_ADDR`/`VAULT_TOKEN`, with a 3s fetch timeout
  and fail-closed behavior (no silent fall-through to env when HTTP is preferred).

## Consequences

- Production must set `DANG_MASTER_KEY` (base64 32 bytes); unset master key keeps the vault
  sealed and plaintext get denied.
- Non-prod may generate `.dang/master.key` once (never commit).
- HTTP Vault is opt-in only (`ENABLE_HTTP_VAULT_MASTER_KEY=1`); without that flag, env/file
  remains the provider even if `VAULT_*` is set.
- Future ADR may adopt HashiCorp Vault / cloud KMS as the default when multi-host unseal and
  audit requirements demand it; until then, do not stub fake remote vault responses.
