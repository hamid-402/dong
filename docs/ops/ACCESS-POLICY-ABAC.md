# Access policy — RBAC + light ABAC (R10-05)

## Capability

`GET /system/capabilities` → `providers.accessPolicy = "rbac_abac_grants_v1"` when grants + evaluator are live.

Evaluator version: `ACCESS_POLICY_VERSION = "rbac_abac_v4"` (decision payload / deny telemetry).

## What ships

| Layer | Location |
|-------|----------|
| Named role sets | `packages/contracts/src/access-policy.ts` |
| Attribute evaluator | `packages/contracts/src/access-abac.ts` → `evaluateAccessPolicy` |
| Policy DSL built-ins | `packages/contracts/src/policy-dsl.ts` → `evaluateBuiltInPoliciesForAction` |
| Enforcement | `WorkspaceAccessService.requireAccess` (grants → ABAC → DSL when attrs available) |
| Deny telemetry | `access.policy_denied` via `SecurityEventsService` |

## Policy versions

| Version | Notes |
|---------|--------|
| `rbac_abac_v1` | Approve / confirm / invite / SaaS / DLQ / private read |
| `rbac_abac_v2` | + `expense.create` · `settlement.claim` · `finance.manage`; `requireFinanceManager` routes through `requireAccess` |
| `rbac_abac_v3` | + `statement.read_self` · `statement.read_any` · `statement.export` · `payout.manage` |
| `rbac_abac_v4` | + `settlement.dispute`; Policy DSL built-ins on `requireAccess` when attrs available |

## Actions (v4)

- `workspace.mutate` — deny guest/auditor
- `expense.create` — deny guest/auditor (draft/submit/post/reverse); also runs DSL `expense.reverse`
- `expense.read_private` — owner or finance manager
- `expense.approve` — approver role set; deny `posted` / `reversed`; DSL requires `draft|submitted` when status present
- `settlement.claim` — deny guest/auditor
- `settlement.confirm` — non-readonly; status `claimed` / `pending` (party ACL stays in settlements service)
- `settlement.dispute` — finance or `isParty`; DSL `builtin.settlement.dispute` when attrs available
- `invite.create` — owner/admin
- `finance.manage` — owner/admin/finance (billing, allowances, catalog, payments, …)
- `saas.invoice.manage` — finance manager
- `jobs.dlq` — owner/admin
- `statement.read_self` — any member (share-based self statement)
- `statement.read_any` — finance manager or auditor
- `statement.export` — self always; others need finance/auditor (or grant)
- `payout.manage` — owner/admin (upsert + clear workspace payout profile)

## Not in this slice

- External / remote PDP
- Amount-threshold ABAC (maker-checker remains separate)
- Vault-backed policy store

## Ops

Wire new hot paths through `requireAccess(action, resource?)` instead of ad-hoc role Sets when adding mutations. Prefer `requireFinanceManager` / `requireMutableMember` helpers (both call `requireAccess`).
