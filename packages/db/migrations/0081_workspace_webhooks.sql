-- G15 depth: outbound workspace webhooks (HMAC) with tenant RLS.

CREATE TABLE IF NOT EXISTS "ops"."workspace_webhook" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "secret" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ops_workspace_webhook_idempotency_uq"
  ON "ops"."workspace_webhook" ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "ops_workspace_webhook_workspace_idx"
  ON "ops"."workspace_webhook" ("workspace_id", "created_at" DESC);

ALTER TABLE "ops"."workspace_webhook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops"."workspace_webhook" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ops_workspace_webhook_tenant_select"
ON "ops"."workspace_webhook"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "ops_workspace_webhook_tenant_insert"
ON "ops"."workspace_webhook"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "ops_workspace_webhook_tenant_update"
ON "ops"."workspace_webhook"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON ops.workspace_webhook TO dang_runtime';
  END IF;
END
$$;
