CREATE SCHEMA IF NOT EXISTS "personal";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."money_account_kind" AS ENUM('cash', 'bank', 'card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "personal"."money_txn_kind" AS ENUM('income', 'expense', 'transfer_in', 'transfer_out', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."money_account" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "kind" "personal"."money_account_kind" NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "opening_balance_minor" bigint DEFAULT 0 NOT NULL,
  "archived_at" timestamp with time zone,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal"."money_account"
  ADD CONSTRAINT "money_account_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "money_account_owner_idempotency_uq"
  ON "personal"."money_account" USING btree ("owner_user_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "money_account_owner_idx"
  ON "personal"."money_account" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."money_txn" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "kind" "personal"."money_txn_kind" NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "occurred_on" date NOT NULL,
  "note" text,
  "transfer_group_id" uuid,
  "linked_workspace_id" uuid,
  "linked_expense_id" uuid,
  "linked_settlement_id" uuid,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal"."money_txn"
  ADD CONSTRAINT "money_txn_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal"."money_txn"
  ADD CONSTRAINT "money_txn_account_fk"
  FOREIGN KEY ("account_id") REFERENCES "personal"."money_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal"."money_txn"
  ADD CONSTRAINT "money_txn_amount_chk"
  CHECK ("amount_minor" > 0);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "money_txn_owner_idempotency_uq"
  ON "personal"."money_txn" USING btree ("owner_user_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "money_txn_account_occurred_idx"
  ON "personal"."money_txn" USING btree ("account_id", "occurred_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "money_txn_owner_occurred_idx"
  ON "personal"."money_txn" USING btree ("owner_user_id", "occurred_on");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."budget" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "year_month" text NOT NULL,
  "limit_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal"."budget"
  ADD CONSTRAINT "personal_budget_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal"."budget"
  ADD CONSTRAINT "personal_budget_limit_chk"
  CHECK ("limit_minor" > 0);
--> statement-breakpoint
ALTER TABLE "personal"."budget"
  ADD CONSTRAINT "personal_budget_month_chk"
  CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personal_budget_owner_month_uq"
  ON "personal"."budget" USING btree ("owner_user_id", "year_month");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personal_budget_owner_idempotency_uq"
  ON "personal"."budget" USING btree ("owner_user_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "personal"."money_account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."money_account" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "money_account_owner_all"
ON "personal"."money_account"
FOR ALL
USING ("owner_user_id" = "app"."current_user_id"())
WITH CHECK ("owner_user_id" = "app"."current_user_id"());
--> statement-breakpoint
ALTER TABLE "personal"."money_txn" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."money_txn" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "money_txn_owner_all"
ON "personal"."money_txn"
FOR ALL
USING ("owner_user_id" = "app"."current_user_id"())
WITH CHECK ("owner_user_id" = "app"."current_user_id"());
--> statement-breakpoint
ALTER TABLE "personal"."budget" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."budget" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "personal_budget_owner_all"
ON "personal"."budget"
FOR ALL
USING ("owner_user_id" = "app"."current_user_id"())
WITH CHECK ("owner_user_id" = "app"."current_user_id"());
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA personal TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.money_account TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.money_txn TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.budget TO dang_runtime';
  END IF;
END $$;
