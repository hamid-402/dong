-- Dong 2.0 Wave 6: BI base view, cost centers, and per-item family audience.
-- Law 7: keep this as a plain VIEW; use a materialized view only after EXPLAIN evidence.

CREATE TABLE IF NOT EXISTS "finance"."cost_center" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL
    REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cost_center_workspace_code_uq" UNIQUE ("workspace_id", "code")
);

CREATE INDEX IF NOT EXISTS "cost_center_workspace_active_idx"
  ON "finance"."cost_center" ("workspace_id", "active");

ALTER TABLE "finance"."cost_center" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."cost_center" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_center_tenant_all" ON "finance"."cost_center";
CREATE POLICY "cost_center_tenant_all" ON "finance"."cost_center" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "cost_center_id" uuid;

DO $$ BEGIN
  ALTER TABLE "finance"."expense"
    ADD CONSTRAINT "expense_cost_center_id_fk"
    FOREIGN KEY ("cost_center_id") REFERENCES "finance"."cost_center"("id")
    ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "expense_cost_center_id_idx"
  ON "finance"."expense" ("workspace_id", "cost_center_id");

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "audience" text DEFAULT 'all_members' NOT NULL;

DO $$ BEGIN
  ALTER TABLE "finance"."expense"
    ADD CONSTRAINT "expense_audience_check"
    CHECK ("audience" IN ('all_members', 'finance_and_creator'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE VIEW "finance"."v_expense_posted_monthly"
WITH (security_invoker = true) AS
SELECT
  "workspace_id",
  date_trunc('month', "occurred_on")::date AS "month_on",
  "category_id",
  "visibility",
  count(*)::int AS "expense_count",
  sum("total_minor")::bigint AS "total_minor"
FROM "finance"."expense"
WHERE "status" = 'posted'
GROUP BY
  "workspace_id",
  date_trunc('month', "occurred_on")::date,
  "category_id",
  "visibility";

COMMENT ON VIEW "finance"."v_expense_posted_monthly" IS
  'Law 7: plain BI view; materialize only after EXPLAIN evidence demonstrates need.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.cost_center TO dang_runtime';
    EXECUTE 'GRANT SELECT ON finance.v_expense_posted_monthly TO dang_runtime';
  END IF;
END $$;
