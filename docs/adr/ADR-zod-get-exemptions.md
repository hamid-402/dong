# ADR: Zod exemption for GET-only controllers

## Status

Accepted

## Context

Some Nest controllers (`ledger`, `balances`, `dashboard`, `audit`, `notifications`, …) expose mostly GET endpoints with path/query params and no `@Body()`.

## Decision

- Every `@Body()` endpoint **must** use `ZodValidationPipe` + a contracts schema.
- Controllers without request bodies may omit body Zod; query/path validation stays Nest/typed params.
- New POST/PATCH/PUT without Zod is a review blocker.

## Consequences

- Lower risk on read paths; write paths stay fail-closed.
- Document exemptions in PR when adding a body-less controller.
