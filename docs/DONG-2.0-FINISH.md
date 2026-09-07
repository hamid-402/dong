# Dong 2.0 — Wave F finish inventory

Migration: `packages/db/migrations/0038_wave_f_finish_infra.sql`.

| Feature | Live | Infrastructure | Flag |
|---|---|---|---|
| Reimbursement FSM | API/store/UI list | schema, RLS, FSM test, optional private→company promotion | `ENABLE_REIMBURSEMENT` |
| Receipt policy | enforced on submit/post | attachment count + memory test | `ENABLE_EXPENSE_POLICY` |
| Category budgets | create/list/real posted usage | schema, RLS, org usage panel | `ENABLE_CATEGORY_BUDGET` |
| Recurrence versions | revise endpoint | additive version lineage | existing recurrence controls |
| FX rates | authenticated table read/write | global system table; conversion deliberately not live | `ENABLE_FX_RATES` (write) |
| Expense CSV import | creates real drafts | pure parser + test + org form | `ENABLE_EXPENSE_IMPORT` |
| Weekly digest | opt-in prefs and worker/API tick | real workspace count; delivery follows Mailer capability | `ENABLE_WEEKLY_DIGEST` |
| Workspace plans | get/owner-admin put | schema, RLS, `planAllows`; no charging | `ENABLE_WORKSPACE_PLANS`, `ENABLE_PLAN_ADMIN` |
| Approval steps | first approver step and queue projection | schema, RLS, expense submit/approve hooks | `ENABLE_APPROVAL_STEPS` |

FX conversion, subscription charging, automatic exchange-rate acquisition, and synthetic
digest analytics are infrastructure-only and are not claimed as live. `/system/capabilities`
always reports `conversionLive: false`; provider and mail delivery remain runtime-derived.

## Local defaults

In `development` / `test`, unset `ENABLE_*` flags default **on** so the full product
surface is usable locally without hand-editing `.env`. Production still defaults **off**.
Override any flag with `=0`, or set `DANG_PRODUCT_FLAGS_DEFAULT=0` to force all unset→off.
