-- Stage 10 / R10-20: read-oriented analytics warehouse (co-located schema).
-- Optional physical replica: set ANALYTICS_DATABASE_URL to a separate DB.

CREATE SCHEMA IF NOT EXISTS "analytics";

CREATE TABLE IF NOT EXISTS "analytics"."daily_spend_fact" (
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "day" date NOT NULL,
  "expense_count" integer NOT NULL DEFAULT 0,
  "total_minor" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'IRR',
  "refreshed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspace_id", "day")
);

CREATE INDEX IF NOT EXISTS "analytics_daily_spend_workspace_day_idx"
  ON "analytics"."daily_spend_fact" ("workspace_id", "day" DESC);

CREATE TABLE IF NOT EXISTS "analytics"."etl_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "started_at" timestamptz NOT NULL,
  "finished_at" timestamptz NOT NULL,
  "status" text NOT NULL,
  "rows_upserted" integer NOT NULL DEFAULT 0,
  "source" text NOT NULL,
  "error" text
);

CREATE INDEX IF NOT EXISTS "analytics_etl_run_workspace_idx"
  ON "analytics"."etl_run" ("workspace_id", "finished_at" DESC);

ALTER TABLE "analytics"."daily_spend_fact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics"."daily_spend_fact" FORCE ROW LEVEL SECURITY;
ALTER TABLE "analytics"."etl_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics"."etl_run" FORCE ROW LEVEL SECURITY;

CREATE POLICY "analytics_daily_spend_tenant_select"
ON "analytics"."daily_spend_fact"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "analytics_daily_spend_tenant_insert"
ON "analytics"."daily_spend_fact"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "analytics_daily_spend_tenant_update"
ON "analytics"."daily_spend_fact"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "analytics_daily_spend_tenant_delete"
ON "analytics"."daily_spend_fact"
FOR DELETE
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "analytics_etl_run_tenant_select"
ON "analytics"."etl_run"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "analytics_etl_run_tenant_insert"
ON "analytics"."etl_run"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA analytics TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON analytics.daily_spend_fact TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON analytics.etl_run TO dang_runtime';
  END IF;
END
$$;
