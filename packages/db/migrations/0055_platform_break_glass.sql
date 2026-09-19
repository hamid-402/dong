-- Stage 11 / S11-13: platform break-glass + account disable columns.

ALTER TABLE "iam"."user_account"
  ADD COLUMN IF NOT EXISTS "disabled_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "disabled_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "disabled_reason" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_account_disabled_by_fk'
  ) THEN
    ALTER TABLE "iam"."user_account"
      ADD CONSTRAINT "user_account_disabled_by_fk"
      FOREIGN KEY ("disabled_by_user_id") REFERENCES "iam"."user_account"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "iam"."platform_break_glass" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "reason" text NOT NULL,
  "granted_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "ticket_ref" text,
  CONSTRAINT "platform_break_glass_expiry_chk" CHECK ("expires_at" > "granted_at")
);

CREATE INDEX IF NOT EXISTS "platform_break_glass_actor_idx"
  ON "iam"."platform_break_glass" ("actor_user_id", "expires_at");

CREATE INDEX IF NOT EXISTS "platform_break_glass_ws_idx"
  ON "iam"."platform_break_glass" ("workspace_id", "expires_at");
