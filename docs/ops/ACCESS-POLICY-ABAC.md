# Access policy — RBAC + light ABAC (R10-05 / R7)

## Capability

`GET /system/capabilities` → `providers.accessPolicy = "rbac_abac_grants_v1"` when grants + evaluator are live.

Evaluator version: `ACCESS_POLICY_VERSION = "rbac_abac_v5"` (decision payload / deny telemetry).

## What ships

| Layer | Location |
|-------|----------|
| Named role sets | `packages/contracts/src/access-policy.ts` |
| Attribute evaluator | `packages/contracts/src/access-abac.ts` → `evaluateAccessPolicy` |
| Policy DSL built-ins | `packages/contracts/src/policy-dsl.ts` → `evaluateBuiltInPoliciesForAction` |
| Enforcement | `WorkspaceAccessService.requireAccess` (grants → ABAC → DSL → deputy cap when attrs available) |
| Deny telemetry | `access.policy_denied` via `SecurityEventsService` |

## Policy versions

| Version | Notes |
|---------|--------|
| `rbac_abac_v1` | Approve / confirm / invite / SaaS / DLQ / private read |
| `rbac_abac_v2` | + `expense.create` · `settlement.claim` · `finance.manage` |
| `rbac_abac_v3` | + statement.* · `payout.manage` |
| `rbac_abac_v4` | + `settlement.dispute`; Policy DSL built-ins |
| `rbac_abac_v5` | + enforce deputy `approvalCapMinor` when `amountMinor` present (R7) |

## Actions (v5)

- `workspace.mutate` — deny guest/auditor
- `expense.create` — deny guest/auditor
- `expense.read_private` — owner or finance manager
- `expense.approve` — approver role set + status; deputy cap when amount present
- `settlement.claim` / `settlement.confirm` — non-readonly (+ status); deputy cap when amount present
- `settlement.dispute` — finance or `isParty`
- `invite.create` — owner/admin
- `finance.manage` — owner/admin/finance
- `saas.invoice.manage` — finance manager
- `jobs.dlq` — owner/admin
- `statement.read_self` / `read_any` / `export` — as before
- `payout.manage` — owner/admin

## Not in this slice

- External / remote PDP
- Field-level / JIT / service-account ABAC
- Vault-backed policy store
- Amount thresholds outside deputy `approvalCapMinor` (maker-checker جداست)

## Ops

Pass `amountMinor` on amount-sensitive `requireAccess` calls so deputy caps apply. Prefer `requireFinanceManager` / `requireMutableMember`.
