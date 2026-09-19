-- G09: org expense policy depth + travel mission kind on expense

ALTER TABLE "finance"."workspace_expense_policy"
  ADD COLUMN IF NOT EXISTS "require_cost_center" boolean NOT NULL DEFAULT false;

ALTER TABLE "finance"."workspace_expense_policy"
  ADD COLUMN IF NOT EXISTS "approval_tiers_json" text;

ALTER TABLE "finance"."workspace_expense_policy"
  ADD COLUMN IF NOT EXISTS "per_diem_daily_minor" bigint;

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "mission_kind" text;
