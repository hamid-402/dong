-- Configurable money intents / financial rules (any kind from catalog).
DO $$ BEGIN
  CREATE TYPE "personal"."money_intent_kind" AS ENUM(
    'save_income_percent',
    'spend_cap_amount',
    'spend_cap_income_percent',
    'debt_open_cap',
    'liquid_floor',
    'net_floor',
    'savings_goal_link'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "personal"."money_intent_period" AS ENUM('month', 'week', 'range');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "personal"."money_intent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kind" "personal"."money_intent_kind" NOT NULL,
  "period" "personal"."money_intent_period" NOT NULL DEFAULT 'month',
  "target_minor" bigint,
  "target_percent" integer,
  "goal_id" uuid,
  "active" boolean NOT NULL DEFAULT true,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "money_intent_target_percent_chk"
    CHECK ("target_percent" IS NULL OR ("target_percent" >= 1 AND "target_percent" <= 100)),
  CONSTRAINT "money_intent_target_minor_chk"
    CHECK ("target_minor" IS NULL OR "target_minor" > 0)
);

DO $$ BEGIN
  ALTER TABLE "personal"."money_intent"
    ADD CONSTRAINT "money_intent_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "personal"."money_intent"
    ADD CONSTRAINT "money_intent_goal_fk"
    FOREIGN KEY ("goal_id") REFERENCES "personal"."savings_goal"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "money_intent_user_idempotency_uq"
  ON "personal"."money_intent" USING btree ("user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "money_intent_user_idx"
  ON "personal"."money_intent" USING btree ("user_id");
