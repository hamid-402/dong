-- Durable job enqueue history (W7 deepen). Status = enqueue-time honesty until worker write-back exists.

CREATE SCHEMA IF NOT EXISTS "ops";

CREATE TABLE IF NOT EXISTS "ops"."job_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "execution" text NOT NULL,
  "detail" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ops_job_run_job_id_uq" ON "ops"."job_run" ("job_id");
CREATE INDEX IF NOT EXISTS "ops_job_run_workspace_created_idx"
  ON "ops"."job_run" ("workspace_id", "created_at" DESC);

ALTER TABLE "ops"."job_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops"."job_run" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ops_job_run_tenant_select"
ON "ops"."job_run"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "ops_job_run_tenant_insert"
ON "ops"."job_run"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

-- Account UI coach dismissals (shell + statements tours).
CREATE TABLE IF NOT EXISTS "iam"."user_ui_pref" (
  "user_id" uuid PRIMARY KEY REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "dismiss_shell_tour" boolean DEFAULT false NOT NULL,
  "dismiss_statements_tour" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "iam"."user_ui_pref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."user_ui_pref" FORCE ROW LEVEL SECURITY;

CREATE POLICY "iam_user_ui_pref_self_select"
ON "iam"."user_ui_pref"
FOR SELECT
USING ("user_id"::text = current_setting('app.user_id', true));

CREATE POLICY "iam_user_ui_pref_self_insert"
ON "iam"."user_ui_pref"
FOR INSERT
WITH CHECK ("user_id"::text = current_setting('app.user_id', true));

CREATE POLICY "iam_user_ui_pref_self_update"
ON "iam"."user_ui_pref"
FOR UPDATE
USING ("user_id"::text = current_setting('app.user_id', true))
WITH CHECK ("user_id"::text = current_setting('app.user_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ops TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON ops.job_run TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON iam.user_ui_pref TO dang_runtime';
  END IF;
END
$$;
