-- Stage 11 / S11-01: account identity — username, phone, platform role, display unit.

ALTER TABLE "iam"."user_account"
  ADD COLUMN IF NOT EXISTS "username" text,
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "phone_hash" text,
  ADD COLUMN IF NOT EXISTS "phone_verified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "platform_role" text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS "display_unit" text,
  ADD COLUMN IF NOT EXISTS "username_changed_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_account_platform_role_chk'
  ) THEN
    ALTER TABLE "iam"."user_account"
      ADD CONSTRAINT "user_account_platform_role_chk"
      CHECK ("platform_role" IN ('user', 'platform_support', 'platform_owner'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_account_display_unit_chk'
  ) THEN
    ALTER TABLE "iam"."user_account"
      ADD CONSTRAINT "user_account_display_unit_chk"
      CHECK ("display_unit" IS NULL OR "display_unit" IN ('rial', 'toman'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "user_account_username_uq"
  ON "iam"."user_account" ("username")
  WHERE "username" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "user_account_phone_uq"
  ON "iam"."user_account" ("phone")
  WHERE "phone" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "user_account_phone_hash_idx"
  ON "iam"."user_account" ("phone_hash")
  WHERE "phone_hash" IS NOT NULL;
