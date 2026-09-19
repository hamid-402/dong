-- Stage 10 / R10-15 depth: durable security events (ops.security_event).
-- Platform-scoped listing — no tenant RLS (auth events may lack workspace_id).

CREATE SCHEMA IF NOT EXISTS "ops";

CREATE TABLE IF NOT EXISTS "ops"."security_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event" text NOT NULL,
  "category" text NOT NULL,
  "severity" text NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "workspace_id" uuid REFERENCES "iam"."workspace"("id") ON DELETE SET NULL,
  "actor_user_id" uuid,
  "target_type" text,
  "target_id" text,
  "reason" text,
  "request_id" text,
  "trace_id" text,
  "attrs" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "ops_security_event_time_idx"
  ON "ops"."security_event" ("occurred_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "ops_security_event_cat_sev_idx"
  ON "ops"."security_event" ("category", "severity", "occurred_at" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ops TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON ops.security_event TO dang_runtime';
  END IF;
END
$$;
