-- Phase 2/3: year periods, categories, recurring, report exports, approval helper columns
ALTER TYPE "finance"."period_kind" ADD VALUE IF NOT EXISTS 'year';

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "category_id" uuid,
  ADD COLUMN IF NOT EXISTS "budget_id" uuid,
  ADD COLUMN IF NOT EXISTS "requires_approval" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "finance"."expense_category" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "finance"."expense_category"
  ADD CONSTRAINT "expense_category_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade;

CREATE UNIQUE INDEX IF NOT EXISTS "expense_category_workspace_slug_uq"
  ON "finance"."expense_category" USING btree ("workspace_id", "slug");

DO $$ BEGIN
  ALTER TABLE "finance"."expense"
    ADD CONSTRAINT "expense_category_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "finance"."expense_category"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "finance"."recurring_rule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "cadence" text NOT NULL,
  "next_run_on" date NOT NULL,
  "visibility" "finance"."expense_visibility" DEFAULT 'private' NOT NULL,
  "split_method" "finance"."split_method" DEFAULT 'equal' NOT NULL,
  "category_id" uuid,
  "active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "finance"."recurring_rule"
  ADD CONSTRAINT "recurring_rule_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade;

ALTER TABLE "finance"."recurring_rule"
  ADD CONSTRAINT "recurring_rule_created_by_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id");

CREATE UNIQUE INDEX IF NOT EXISTS "recurring_rule_idempotency_uq"
  ON "finance"."recurring_rule" USING btree ("workspace_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "finance"."report_export" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "format" text NOT NULL,
  "from_on" date NOT NULL,
  "to_on" date NOT NULL,
  "group_by" text NOT NULL,
  "status" text NOT NULL,
  "row_count" integer DEFAULT 0 NOT NULL,
  "csv_body" text,
  "error_detail" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

ALTER TABLE "finance"."report_export"
  ADD CONSTRAINT "report_export_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade;

ALTER TABLE "finance"."report_export"
  ADD CONSTRAINT "report_export_created_by_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id");

CREATE INDEX IF NOT EXISTS "report_export_workspace_created_idx"
  ON "finance"."report_export" USING btree ("workspace_id", "created_at");

ALTER TABLE "finance"."expense_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."expense_category" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expense_category_tenant_all" ON "finance"."expense_category" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

ALTER TABLE "finance"."recurring_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."recurring_rule" FORCE ROW LEVEL SECURITY;
CREATE POLICY "recurring_rule_tenant_all" ON "finance"."recurring_rule" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

ALTER TABLE "finance"."report_export" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."report_export" FORCE ROW LEVEL SECURITY;
CREATE POLICY "report_export_tenant_all" ON "finance"."report_export" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_category TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.recurring_rule TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.report_export TO dang_runtime';
  END IF;
END $$;
