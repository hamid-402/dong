-- Phase 2.2: vault encrypt/decrypt access log (platform-scoped like security_event).

CREATE SCHEMA IF NOT EXISTS "ops";

CREATE TABLE IF NOT EXISTS "ops"."vault_access_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "secret_ref" text NOT NULL,
  "operation" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "vault_access_log_operation_chk"
    CHECK ("operation" IN ('encrypt', 'decrypt')),
  CONSTRAINT "vault_access_log_actor_type_chk"
    CHECK ("actor_type" IN ('user', 'worker', 'system'))
);

CREATE INDEX IF NOT EXISTS "ops_vault_access_log_time_idx"
  ON "ops"."vault_access_log" ("occurred_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "ops_vault_access_log_secret_idx"
  ON "ops"."vault_access_log" ("secret_ref", "occurred_at" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ops TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON ops.vault_access_log TO dang_runtime';
  END IF;
END
$$;
