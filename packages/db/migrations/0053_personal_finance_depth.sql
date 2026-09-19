-- Stage 11 / S11-10: deep personal finance — income sources, savings goals,
-- spending alerts, monthly close rollup, optional money_txn FKs.

DO $$ BEGIN
  CREATE TYPE "personal"."income_source_kind" AS ENUM(
    'salary', 'bonus', 'freelance', 'rent', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."income_cadence" AS ENUM(
    'monthly', 'weekly', 'yearly', 'irregular'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."savings_goal_status" AS ENUM(
    'active', 'reached', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."spending_alert_scope" AS ENUM(
    'total', 'category', 'group', 'workspace'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."spending_alert_period" AS ENUM('month', 'week');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."spending_alert_channel" AS ENUM('inapp', 'email');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."income_source" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kind" "personal"."income_source_kind" NOT NULL,
  "expected_minor" bigint,
  "cadence" "personal"."income_cadence" NOT NULL DEFAULT 'monthly',
  "currency" text DEFAULT 'IRR' NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal"."income_source"
  ADD CONSTRAINT "income_source_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "income_source_user_idempotency_uq"
  ON "personal"."income_source" USING btree ("user_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "income_source_user_idx"
  ON "personal"."income_source" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."savings_goal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "target_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "target_date" date,
  "account_id" uuid,
  "status" "personal"."savings_goal_status" NOT NULL DEFAULT 'active',
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reached_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "savings_goal_target_chk" CHECK ("target_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal"
  ADD CONSTRAINT "savings_goal_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal"
  ADD CONSTRAINT "savings_goal_account_fk"
  FOREIGN KEY ("account_id") REFERENCES "personal"."money_account"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "savings_goal_user_idempotency_uq"
  ON "personal"."savings_goal" USING btree ("user_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "savings_goal_user_idx"
  ON "personal"."savings_goal" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."savings_goal_contribution" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goal_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "txn_id" uuid,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "savings_goal_contribution_amount_chk" CHECK ("amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal_contribution"
  ADD CONSTRAINT "savings_goal_contribution_goal_fk"
  FOREIGN KEY ("goal_id") REFERENCES "personal"."savings_goal"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal_contribution"
  ADD CONSTRAINT "savings_goal_contribution_txn_fk"
  FOREIGN KEY ("txn_id") REFERENCES "personal"."money_txn"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "savings_goal_contribution_goal_idempotency_uq"
  ON "personal"."savings_goal_contribution" USING btree ("goal_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "savings_goal_contribution_goal_idx"
  ON "personal"."savings_goal_contribution" USING btree ("goal_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."spending_alert" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "scope" "personal"."spending_alert_scope" NOT NULL,
  "ref_id" uuid,
  "period" "personal"."spending_alert_period" NOT NULL DEFAULT 'month',
  "limit_minor" bigint NOT NULL,
  "threshold_percent" integer NOT NULL DEFAULT 80,
  "channel" "personal"."spending_alert_channel" NOT NULL DEFAULT 'inapp',
  "active" boolean NOT NULL DEFAULT true,
  "last_fired_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "spending_alert_limit_chk" CHECK ("limit_minor" > 0),
  CONSTRAINT "spending_alert_threshold_chk"
    CHECK ("threshold_percent" >= 1 AND "threshold_percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "personal"."spending_alert"
  ADD CONSTRAINT "spending_alert_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spending_alert_user_idx"
  ON "personal"."spending_alert" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."monthly_close" (
  "user_id" uuid NOT NULL,
  "year_month" text NOT NULL,
  "income_minor" bigint NOT NULL DEFAULT 0,
  "expense_minor" bigint NOT NULL DEFAULT 0,
  "group_share_minor" bigint NOT NULL DEFAULT 0,
  "personal_minor" bigint NOT NULL DEFAULT 0,
  "saved_minor" bigint NOT NULL DEFAULT 0,
  "top_category_id" uuid,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "monthly_close_pk" PRIMARY KEY ("user_id", "year_month"),
  CONSTRAINT "monthly_close_month_chk"
    CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "monthly_close_nonneg_chk" CHECK (
    "income_minor" >= 0
    AND "expense_minor" >= 0
    AND "group_share_minor" >= 0
    AND "personal_minor" >= 0
    AND "saved_minor" >= 0
  )
);
--> statement-breakpoint
ALTER TABLE "personal"."monthly_close"
  ADD CONSTRAINT "monthly_close_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal"."money_txn"
  ADD COLUMN IF NOT EXISTS "income_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "personal"."money_txn"
  ADD COLUMN IF NOT EXISTS "savings_goal_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "personal"."money_txn"
    ADD CONSTRAINT "money_txn_income_source_fk"
    FOREIGN KEY ("income_source_id") REFERENCES "personal"."income_source"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "personal"."money_txn"
    ADD CONSTRAINT "money_txn_savings_goal_fk"
    FOREIGN KEY ("savings_goal_id") REFERENCES "personal"."savings_goal"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "personal"."income_source" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."income_source" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "income_source_owner_all" ON "personal"."income_source";
--> statement-breakpoint
CREATE POLICY "income_source_owner_all"
ON "personal"."income_source"
FOR ALL
USING ("user_id" = "app"."current_user_id"())
WITH CHECK ("user_id" = "app"."current_user_id"());
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "savings_goal_owner_all" ON "personal"."savings_goal";
--> statement-breakpoint
CREATE POLICY "savings_goal_owner_all"
ON "personal"."savings_goal"
FOR ALL
USING ("user_id" = "app"."current_user_id"())
WITH CHECK ("user_id" = "app"."current_user_id"());
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal_contribution" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."savings_goal_contribution" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "savings_goal_contribution_owner_all"
  ON "personal"."savings_goal_contribution";
--> statement-breakpoint
CREATE POLICY "savings_goal_contribution_owner_all"
ON "personal"."savings_goal_contribution"
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM "personal"."savings_goal" g
    WHERE g."id" = "goal_id" AND g."user_id" = "app"."current_user_id"()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "personal"."savings_goal" g
    WHERE g."id" = "goal_id" AND g."user_id" = "app"."current_user_id"()
  )
);
--> statement-breakpoint
ALTER TABLE "personal"."spending_alert" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."spending_alert" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "spending_alert_owner_all" ON "personal"."spending_alert";
--> statement-breakpoint
CREATE POLICY "spending_alert_owner_all"
ON "personal"."spending_alert"
FOR ALL
USING ("user_id" = "app"."current_user_id"())
WITH CHECK ("user_id" = "app"."current_user_id"());
--> statement-breakpoint
ALTER TABLE "personal"."monthly_close" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."monthly_close" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "monthly_close_owner_all" ON "personal"."monthly_close";
--> statement-breakpoint
CREATE POLICY "monthly_close_owner_all"
ON "personal"."monthly_close"
FOR ALL
USING ("user_id" = "app"."current_user_id"())
WITH CHECK ("user_id" = "app"."current_user_id"());
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA personal TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.income_source TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.savings_goal TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.savings_goal_contribution TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.spending_alert TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.monthly_close TO dang_runtime';
  END IF;
END $$;
