ALTER TABLE "finance"."recurring_rule"
  ADD COLUMN IF NOT EXISTS "auto_confirm" boolean NOT NULL DEFAULT false;
