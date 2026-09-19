-- Stage 10 B1 / R10-03: transactional outbox for domain side-effects.

CREATE SCHEMA IF NOT EXISTS "ops";

CREATE TABLE IF NOT EXISTS "ops"."outbox_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "request_id" text,
  "trace_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "processed_at" timestamptz,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text
);

CREATE INDEX IF NOT EXISTS "ops_outbox_pending_idx"
  ON "ops"."outbox_event" ("created_at")
  WHERE "processed_at" IS NULL;

CREATE INDEX IF NOT EXISTS "ops_outbox_workspace_idx"
  ON "ops"."outbox_event" ("workspace_id", "created_at");

ALTER TABLE "ops"."outbox_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ops"."outbox_event" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ops_outbox_tenant_select"
ON "ops"."outbox_event"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "ops_outbox_tenant_insert"
ON "ops"."outbox_event"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "ops_outbox_tenant_update"
ON "ops"."outbox_event"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ops TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON ops.outbox_event TO dang_runtime';
  END IF;
END
$$;
