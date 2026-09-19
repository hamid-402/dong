-- Stage 11 / S11-04: deputy_finance role, role grants, deputy windows.

ALTER TYPE "iam"."membership_role" ADD VALUE IF NOT EXISTS 'deputy_finance';

CREATE TABLE IF NOT EXISTS "iam"."workspace_role_grant" (
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "action" text NOT NULL,
  "effect" text NOT NULL,
  "updated_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "role", "action"),
  CONSTRAINT "workspace_role_grant_effect_chk" CHECK ("effect" IN ('allow', 'deny'))
);

CREATE TABLE IF NOT EXISTS "iam"."membership_permission_override" (
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "action" text NOT NULL,
  "effect" text NOT NULL,
  "updated_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id", "action"),
  CONSTRAINT "membership_permission_override_effect_chk" CHECK ("effect" IN ('allow', 'deny'))
);

CREATE TABLE IF NOT EXISTS "iam"."deputy_finance_window" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "approval_cap_minor" text,
  "created_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  CONSTRAINT "deputy_finance_window_range_chk" CHECK ("ends_at" > "starts_at")
);

CREATE INDEX IF NOT EXISTS "deputy_finance_window_ws_user_idx"
  ON "iam"."deputy_finance_window" ("workspace_id", "user_id", "starts_at");
