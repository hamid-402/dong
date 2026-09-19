-- Workspace payout instructions for member statements (destination account display).
-- Not PSP card custody — statement footer / settings only.

CREATE TABLE IF NOT EXISTS "finance"."workspace_payout_profile" (
  "workspace_id" uuid PRIMARY KEY NOT NULL
    REFERENCES "iam"."workspace"("id") ON DELETE CASCADE,
  "holder_name" text NOT NULL,
  "destination_kind" text NOT NULL,
  "destination_value" text NOT NULL,
  "bank_name" text,
  "updated_by_user_id" uuid NOT NULL
    REFERENCES "iam"."user_account"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_payout_kind_chk"
    CHECK ("destination_kind" IN ('card', 'iban'))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.workspace_payout_profile TO dang_runtime';
  END IF;
END
$$;
