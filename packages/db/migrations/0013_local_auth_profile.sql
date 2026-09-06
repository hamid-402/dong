-- Local email/password auth + profile fields + sessions + password reset

ALTER TABLE "iam"."user_account"
  ADD COLUMN IF NOT EXISTS "email" text,
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "password_hash" text,
  ADD COLUMN IF NOT EXISTS "avatar_url" text,
  ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'fa-IR',
  ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'Asia/Tehran';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_account_email_uq"
  ON "iam"."user_account" (lower("email"))
  WHERE "email" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "iam"."auth_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "iam"."auth_session"
  ADD CONSTRAINT "auth_session_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_session_token_hash_uq"
  ON "iam"."auth_session" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_session_user_idx"
  ON "iam"."auth_session" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "iam"."auth_password_reset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "iam"."auth_password_reset"
  ADD CONSTRAINT "auth_password_reset_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "auth_password_reset_token_hash_uq"
  ON "iam"."auth_password_reset" USING btree ("token_hash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_password_reset_user_idx"
  ON "iam"."auth_password_reset" USING btree ("user_id");
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.auth_session TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.auth_password_reset TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON iam.user_account TO dang_runtime';
  END IF;
END $$;
