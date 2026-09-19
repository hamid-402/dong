-- Per-event in-app notification prefs (additive; defaults on = opt-out).

ALTER TABLE "iam"."user_notification_pref"
  ADD COLUMN IF NOT EXISTS "expense_posted" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "settlement_claimed" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "invite_accepted" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "security_alert" boolean NOT NULL DEFAULT true;
