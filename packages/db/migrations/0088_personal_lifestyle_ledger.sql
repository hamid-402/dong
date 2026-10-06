-- Personal lifestyle ledger: allocation plan + paycheck (Jalali month unique).

CREATE TABLE IF NOT EXISTS "personal"."allocation_plan" (
  "user_id" uuid PRIMARY KEY,
  "solo_percent" integer NOT NULL DEFAULT 40,
  "group_percent" integer NOT NULL DEFAULT 15,
  "building_percent" integer NOT NULL DEFAULT 10,
  "org_percent" integer NOT NULL DEFAULT 5,
  "savings_percent" integer NOT NULL DEFAULT 30,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "allocation_plan_percents_sum_chk" CHECK (
    "solo_percent" + "group_percent" + "building_percent" + "org_percent" + "savings_percent" = 100
  ),
  CONSTRAINT "allocation_plan_percents_range_chk" CHECK (
    "solo_percent" BETWEEN 0 AND 100
    AND "group_percent" BETWEEN 0 AND 100
    AND "building_percent" BETWEEN 0 AND 100
    AND "org_percent" BETWEEN 0 AND 100
    AND "savings_percent" BETWEEN 0 AND 100
  )
);

DO $$ BEGIN
  ALTER TABLE "personal"."allocation_plan"
    ADD CONSTRAINT "allocation_plan_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "personal"."paycheck" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "year_month" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'IRR',
  "occurred_on" date NOT NULL,
  "income_source_id" uuid,
  "money_txn_id" uuid,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "paycheck_amount_chk" CHECK ("amount_minor" > 0)
);

DO $$ BEGIN
  ALTER TABLE "personal"."paycheck"
    ADD CONSTRAINT "paycheck_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "personal"."paycheck"
    ADD CONSTRAINT "paycheck_income_source_fk"
    FOREIGN KEY ("income_source_id") REFERENCES "personal"."income_source"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "personal"."paycheck"
    ADD CONSTRAINT "paycheck_money_txn_fk"
    FOREIGN KEY ("money_txn_id") REFERENCES "personal"."money_txn"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "paycheck_user_year_month_uq"
  ON "personal"."paycheck" USING btree ("user_id", "year_month");

CREATE UNIQUE INDEX IF NOT EXISTS "paycheck_user_idempotency_uq"
  ON "personal"."paycheck" USING btree ("user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "paycheck_user_idx"
  ON "personal"."paycheck" USING btree ("user_id");
