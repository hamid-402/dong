-- Phase 2.3: multi-level approval decisions (multiple rows per request).

CREATE TABLE IF NOT EXISTS "finance"."approval_decision" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "request_type" text NOT NULL,
  "request_id" uuid NOT NULL,
  "amount_minor" text NOT NULL,
  "approver_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "decision" text NOT NULL,
  "approver_role" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "approval_decision_decision_chk"
    CHECK ("decision" IN ('approved', 'rejected')),
  CONSTRAINT "approval_decision_approver_uq"
    UNIQUE ("workspace_id", "request_type", "request_id", "approver_user_id")
);

CREATE INDEX IF NOT EXISTS "approval_decision_request_idx"
  ON "finance"."approval_decision" ("workspace_id", "request_type", "request_id", "created_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.approval_decision TO dang_runtime';
  END IF;
END
$$;

ALTER TABLE "finance"."approval_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."approval_decision" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approval_decision_tenant_all" ON "finance"."approval_decision";
CREATE POLICY "approval_decision_tenant_all" ON "finance"."approval_decision" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
