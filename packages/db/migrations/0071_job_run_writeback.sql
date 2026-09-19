-- Worker completion write-back for ops.job_run (beyond enqueue-time honesty).

ALTER TABLE "ops"."job_run"
  ADD COLUMN IF NOT EXISTS "finished_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_error" text;

DROP POLICY IF EXISTS "ops_job_run_tenant_update" ON "ops"."job_run";
CREATE POLICY "ops_job_run_tenant_update"
ON "ops"."job_run"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON ops.job_run TO dang_runtime';
  END IF;
END
$$;
