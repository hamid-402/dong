# `@dang/db`

Drizzle schema + SQL migrations under `migrations/` (journal: `migrations/meta/_journal.json`).

## Social directory migrations (0045 / 0091)

`0045_social_directory_friends` creates `social.user_directory_setting`, `social.friendship`, and `social.contact_sync_run`.

On some **dev** databases, that tag has **no row** in `drizzle.__drizzle_migrations` (journal/DB drift). Because its `when` is older than the latest already-applied migration, drizzle will **not** re-run `0045`.

`0091_social_directory_friends_cover` idempotently covers the same objects (`CREATE TABLE IF NOT EXISTS` / indexes) so those tables exist even when `0045` was never recorded.

Do not edit migrations `0000`–`0091`. New changes need a new incremental file only.

## RLS

Tenant/user GUC helpers live in `0001_tenant_rls.sql` (`app.current_user_id()`, `app.current_workspace_id()`). Session is set via `tenantContextQuery` in `src/client.ts`.

Social tables use FORCE RLS via `0092_social_rls` (user-scoped policies). See [`docs/rls-social-proposal.md`](../../docs/rls-social-proposal.md).
