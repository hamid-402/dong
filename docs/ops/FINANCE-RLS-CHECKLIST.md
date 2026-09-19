# Finance RLS checklist (statements / payout)

Honest ops checklist for tenant isolation on finance statement surfaces.
Run after `pnpm db:migrate` (migration `0063` applies payout RLS + `statement_export.expires_at`).

## Tables

| Table | RLS | FORCE | Policy | Notes |
|-------|-----|-------|--------|-------|
| `finance.statement_export` | yes (`0051`) | yes | `statement_export_tenant_all` | `expires_at` + index from `0063`; lazy purge on get |
| `finance.workspace_payout_profile` | yes (`0063`) | yes | `workspace_payout_profile_tenant_all` | GRANT DELETE already from `0062`; clear via API `DELETE` |

## Automated proof

```bash
# Requires DATABASE_URL as dang_runtime (NOBYPASSRLS)
pnpm --filter @dang/db test
```

Cross-tenant cases in `packages/db/tests/cross-tenant.test.ts` cover:

- `workspace_payout_profile` isolation
- `statement_export` isolation

## Manual spot-check (optional)

1. Two workspaces A/B with distinct owners.
2. Upsert payout on A; as tenant B context, `SELECT` on A's `workspace_id` → 0 rows.
3. Create statement export on A; same for B → 0 rows.
4. Confirm `providers.payoutInstructions` / `providers.statements` from `/system/capabilities` match persistence.

## Not claimed

- Server PDF / SMTP / Zarinpal (product stubs or absent keys).
- Full SQL push-down for expense list filters (service filters after visibility ACL today).
