-- Dong 2.0 Wave F: temporary guests, member allowances, and expense policy.

ALTER TYPE "iam"."membership_role" ADD VALUE IF NOT EXISTS 'guest';

CREATE TABLE IF NOT EXISTS "finance"."member_allowance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "member_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "period_kind" text NOT NULL CHECK ("period_kind" IN ('week', 'month')),
  "limit_minor" bigint NOT NULL CHECK ("limit_minor" > 0),
  "currency" text DEFAULT 'IRR' NOT NULL,
  "alert_pct" integer DEFAULT 80 NOT NULL CHECK ("alert_pct" BETWEEN 1 AND 100),
  "active" boolean DEFAULT true NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "member_allowance_idempotency_uq"
    UNIQUE ("workspace_id", "idempotency_key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "member_allowance_active_member_period_uq"
  ON "finance"."member_allowance" ("workspace_id", "member_user_id", "period_kind")
  WHERE "active";
CREATE INDEX IF NOT EXISTS "member_allowance_workspace_active_idx"
  ON "finance"."member_allowance" ("workspace_id", "active");

ALTER TABLE "finance"."member_allowance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."member_allowance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member_allowance_tenant_all" ON "finance"."member_allowance";
CREATE POLICY "member_allowance_tenant_all" ON "finance"."member_allowance" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE TABLE IF NOT EXISTS "finance"."workspace_expense_policy" (
  "workspace_id" uuid PRIMARY KEY REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "approval_threshold_minor" bigint CHECK (
    "approval_threshold_minor" IS NULL OR "approval_threshold_minor" > 0
  ),
  "require_receipt_above_minor" bigint CHECK (
    "require_receipt_above_minor" IS NULL OR "require_receipt_above_minor" > 0
  ),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL REFERENCES "iam"."user_account"("id")
);

ALTER TABLE "finance"."workspace_expense_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."workspace_expense_policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_expense_policy_tenant_all"
  ON "finance"."workspace_expense_policy";
CREATE POLICY "workspace_expense_policy_tenant_all"
  ON "finance"."workspace_expense_policy" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.member_allowance TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.workspace_expense_policy TO dang_runtime';
  END IF;
END $$;
