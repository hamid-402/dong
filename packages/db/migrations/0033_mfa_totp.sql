-- MFA / TOTP for sensitive roles (Owner/Admin/Finance)
-- Note: totp_secret is stored as base32 plaintext (acceptable for local/dev;
-- production should prefer KMS/AEAD field encryption when available).

ALTER TABLE "iam"."user_account"
  ADD COLUMN IF NOT EXISTS "totp_secret" text,
  ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "iam"."auth_mfa_recovery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "iam"."auth_mfa_recovery"
  ADD CONSTRAINT "auth_mfa_recovery_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_mfa_recovery_user_idx"
  ON "iam"."auth_mfa_recovery" USING btree ("user_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_mfa_recovery_code_hash_uq"
  ON "iam"."auth_mfa_recovery" USING btree ("code_hash");
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.auth_mfa_recovery TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON iam.user_account TO dang_runtime';
  END IF;
END $$;
