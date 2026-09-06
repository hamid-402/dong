-- Email verification tokens for local accounts

CREATE TABLE IF NOT EXISTS "iam"."auth_email_verify" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "iam"."auth_email_verify"
  ADD CONSTRAINT "auth_email_verify_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_email_verify_token_hash_uq"
  ON "iam"."auth_email_verify" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_email_verify_user_idx"
  ON "iam"."auth_email_verify" USING btree ("user_id");
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.auth_email_verify TO dang_runtime';
  END IF;
END $$;
