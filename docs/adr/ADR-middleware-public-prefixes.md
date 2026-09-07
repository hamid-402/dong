# ADR: Middleware public prefixes

## Status

Accepted

## Context

`apps/web/src/middleware.ts` gates web routes with an additive session check. It defines an
allowlist (`PUBLIC_PREFIXES`) that bypasses the session gate and a `PROTECTED_PREFIXES` list
(mirrored in the Next `config.matcher`) that requires a session cookie. Matching uses
`pathMatchesPrefix` — an exact segment-boundary match, so `/login` matches `/login` and
`/login/x` but **not** `/login-fake`.

This ADR records why each public prefix is safe to expose without a session, and asserts that
no authenticated surface is reachable through the allowlist.

## Public prefixes and rationale

| Prefix | Why it is public |
| --- | --- |
| `/login` | Unauthenticated entry point — the sign-in form itself. |
| `/register` | Account creation for users with no session yet. |
| `/forgot-password` | Password-reset request form; must work when logged out. |
| `/reset-password` | Consumes an emailed, single-use token; identity comes from the token, not a session. |
| `/verify-email` | Consumes an emailed verification token; must work before a session exists. |
| `/invite` | Invite-acceptance landing page reached from an emailed link; the token is validated server-side before any workspace data is shown. |
| `/ui-kit` | Static design-system showcase (`/ui-kit`) with no user or workspace data. |

Each public page renders only public content or token-scoped flows. None of them read
workspace, member, ledger, or account data from a session.

## Assertions (cross-checked against middleware.ts)

- **No `/account`** in `PUBLIC_PREFIXES`. `/account` and `/account/*` are in
  `PROTECTED_PREFIXES` and the matcher, so they require a session.
- **No `/w`** (workspace) in `PUBLIC_PREFIXES`. `/w` and `/w/*` are protected — expenses,
  ledger, settlements, members, settings for a workspace are all session-gated.
- **No `/api`** in `PUBLIC_PREFIXES`. The API proxy path is not matched by the middleware at
  all; it is protected independently by the NestJS `AuthGuard` on every non-public controller
  (see `docs/adr/ADR-zod-get-exemptions.md` for the read-path posture). The web middleware must
  never be relied on as the API's authorization boundary.
- Token-bearing public flows (`/reset-password`, `/verify-email`, `/invite`) derive identity
  from a single-use token verified server-side, never from an implicit session.

## Consequences

- Adding a new public prefix is a security-review checkpoint: the reviewer must confirm the
  route exposes no session-scoped data and, if it accepts a token, that the token is verified
  server-side.
- Because matching is segment-boundary based, sibling paths like `/login-attempts` would not be
  treated as public by accident.
- The allowlist and the protected matcher are kept in sync in one file; changes to one should be
  reflected in the other and covered by `apps/web/src/middleware.test.ts`.
