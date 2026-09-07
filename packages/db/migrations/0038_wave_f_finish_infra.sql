-- Dong 2.0 Wave F finish: reimbursements, budgets, FX, digests, plans and approvals.

CREATE TABLE IF NOT EXISTS "finance"."reimbursement_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "expense_id" uuid REFERENCES "finance"."expense"("id") ON DELETE set null,
  "claimant_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "amount_minor" bigint NOT NULL CHECK ("amount_minor" > 0),
  "currency" text DEFAULT 'IRR' NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft','submitted','approved','rejected','paid','cancelled')),
  "note" text,
  "decided_by" uuid REFERENCES "iam"."user_account"("id"),
  "decided_at" timestamptz,
  "paid_at" timestamptz,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE ("workspace_id", "idempotency_key")
);

CREATE TABLE IF NOT EXISTS "finance"."category_budget" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "category_id" uuid NOT NULL REFERENCES "finance"."expense_category"("id") ON DELETE cascade,
  "year_month" text NOT NULL CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  "limit_minor" bigint NOT NULL CHECK ("limit_minor" > 0),
  "alert_pct" integer DEFAULT 80 NOT NULL CHECK ("alert_pct" BETWEEN 1 AND 100),
  "currency" text DEFAULT 'IRR' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE ("workspace_id", "category_id", "year_month"),
  UNIQUE ("workspace_id", "idempotency_key")
);

CREATE TABLE IF NOT EXISTS "finance"."approval_workflow_step" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "expense_id" uuid NOT NULL REFERENCES "finance"."expense"("id") ON DELETE cascade,
  "step_no" integer NOT NULL CHECK ("step_no" > 0),
  "approver_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending','approved','rejected')),
  "decided_at" timestamptz,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE ("expense_id", "step_no")
);

ALTER TABLE "finance"."recurring_rule"
  ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "effective_from" date,
  ADD COLUMN IF NOT EXISTS "supersedes_rule_id" uuid REFERENCES "finance"."recurring_rule"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "finance"."fx_rate" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "base_currency" text NOT NULL CHECK ("base_currency" ~ '^[A-Z]{3}$'),
  "quote_currency" text NOT NULL CHECK ("quote_currency" ~ '^[A-Z]{3}$'),
  "rate_numeric" numeric(24,10) NOT NULL CHECK ("rate_numeric" > 0),
  "as_of" date NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE ("base_currency", "quote_currency", "as_of")
);
COMMENT ON TABLE "finance"."fx_rate" IS 'Global system rate table; intentionally not tenant-RLS. Conversion is not live.';

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "original_currency" text,
  ADD COLUMN IF NOT EXISTS "original_amount_minor" bigint,
  ADD COLUMN IF NOT EXISTS "fx_rate_id" uuid REFERENCES "finance"."fx_rate"("id") ON DELETE set null;

CREATE TABLE IF NOT EXISTS "iam"."user_notification_pref" (
  "user_id" uuid PRIMARY KEY REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "email_digest" text DEFAULT 'off' NOT NULL CHECK ("email_digest" IN ('off','weekly','monthly')),
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "iam"."workspace_plan" (
  "workspace_id" uuid PRIMARY KEY REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "plan" text DEFAULT 'free' NOT NULL CHECK ("plan" IN ('free','pro','business')),
  "seats_limit" integer CHECK ("seats_limit" IS NULL OR "seats_limit" > 0),
  "features_json" text,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reimbursement_request','category_budget','approval_workflow_step']
  LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON finance.%I', t || '_tenant_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON finance.%I FOR ALL USING (workspace_id = app.current_workspace_id()) WITH CHECK (workspace_id = app.current_workspace_id())',
      t || '_tenant_all', t
    );
  END LOOP;
END $$;

ALTER TABLE "iam"."workspace_plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."workspace_plan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_plan_tenant_all" ON "iam"."workspace_plan";
CREATE POLICY "workspace_plan_tenant_all" ON "iam"."workspace_plan" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

-- User-scoped rather than workspace-scoped: the application sets app.user_id.
ALTER TABLE "iam"."user_notification_pref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."user_notification_pref" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_notification_pref_self" ON "iam"."user_notification_pref";
CREATE POLICY "user_notification_pref_self" ON "iam"."user_notification_pref" FOR ALL
  USING (
    "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR current_setting('app.internal_job', true) = '1'
  )
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.reimbursement_request TO dang_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.category_budget TO dang_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.approval_workflow_step TO dang_runtime;
    GRANT SELECT, INSERT ON finance.fx_rate TO dang_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON iam.user_notification_pref TO dang_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON iam.workspace_plan TO dang_runtime;
  END IF;
END $$;
