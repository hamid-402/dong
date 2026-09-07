# ADR: Argon2id via hash-wasm

## Status

Accepted

## Context

Password hashing must use Argon2id. Native bindings (e.g. `argon2` C++) complicate Windows/CI/Docker portability.

## Decision

Use `hash-wasm` Argon2id in the API. Legacy scrypt hashes are rehashed on successful login.

## Consequences

- Slightly slower than native, acceptable for auth volume.
- Same algorithm across all platforms without native compile steps.
