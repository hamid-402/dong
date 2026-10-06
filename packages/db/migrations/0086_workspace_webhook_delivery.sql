-- R8: outbound webhook delivery log (HMAC fan-out audit).

CREATE TABLE IF NOT EXISTS "ops"."workspace_webhook_delivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "webhook_id" uuid NOT NULL REFERENCES "ops"."workspace_webhook"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "ok" boolean NOT NULL,
  "status_code" integer,
  "detail" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ops_workspace_webhook_delivery_ws_created_idx"
  ON "ops"."workspace_webhook_delivery" ("workspace_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ops_workspace_webhook_delivery_hook_created_idx"
  ON "ops"."workspace_webhook_delivery" ("webhook_id", "created_at" DESC);

ALTER TABLE "ops"."workspace_webhook_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops"."workspace_webhook_delivery" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ops_workspace_webhook_delivery_tenant_select"
ON "ops"."workspace_webhook_delivery"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "ops_workspace_webhook_delivery_tenant_insert"
ON "ops"."workspace_webhook_delivery"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT ON ops.workspace_webhook_delivery TO dang_runtime';
  END IF;
END
$$;
