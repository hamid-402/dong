-- Repair: social directory / friendship tables (0045 may be journaled without objects).
-- Idempotent — safe if 0045 already created them.

CREATE SCHEMA IF NOT EXISTS "social";

CREATE TABLE IF NOT EXISTS "social"."user_directory_setting" (
  "user_id" uuid PRIMARY KEY REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "findable_by_username" boolean NOT NULL DEFAULT true,
  "findable_by_phone" boolean NOT NULL DEFAULT true,
  "findable_by_email" boolean NOT NULL DEFAULT false,
  "allow_friend_requests" boolean NOT NULL DEFAULT true,
  "allow_group_invites" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "social"."friendship" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requester_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "addressee_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "pair_key" text NOT NULL,
  "status" text NOT NULL,
  "blocked_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  "note" text,
  "requested_at" timestamptz DEFAULT now() NOT NULL,
  "responded_at" timestamptz,
  CONSTRAINT "friendship_status_chk"
    CHECK ("status" IN ('pending', 'accepted', 'declined', 'blocked')),
  CONSTRAINT "friendship_not_self_chk"
    CHECK ("requester_user_id" <> "addressee_user_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "friendship_pair_key_uq"
  ON "social"."friendship" ("pair_key");
CREATE INDEX IF NOT EXISTS "friendship_requester_idx"
  ON "social"."friendship" ("requester_user_id", "status");
CREATE INDEX IF NOT EXISTS "friendship_addressee_idx"
  ON "social"."friendship" ("addressee_user_id", "status");

CREATE TABLE IF NOT EXISTS "social"."contact_sync_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "ran_at" timestamptz DEFAULT now() NOT NULL,
  "submitted_count" integer NOT NULL,
  "matched_count" integer NOT NULL,
  "source" text NOT NULL,
  CONSTRAINT "contact_sync_source_chk" CHECK ("source" IN ('manual', 'device'))
);

CREATE INDEX IF NOT EXISTS "contact_sync_run_user_idx"
  ON "social"."contact_sync_run" ("user_id", "ran_at" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA social TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA social TO dang_runtime';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA social TO dang_runtime';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA social GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime';
  END IF;
END
$$;
