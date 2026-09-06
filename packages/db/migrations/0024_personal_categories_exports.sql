-- Additive: personal categories, budget alert %, txn category, finance exports
ALTER TABLE "personal"."budget"
  ADD COLUMN IF NOT EXISTS "alert_percent" integer DEFAULT 80 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "personal"."budget"
    ADD CONSTRAINT "personal_budget_alert_chk"
    CHECK ("alert_percent" >= 1 AND "alert_percent" <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."category" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal"."category"
  ADD CONSTRAINT "personal_category_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personal_category_owner_slug_uq"
  ON "personal"."category" USING btree ("owner_user_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personal_category_owner_idempotency_uq"
  ON "personal"."category" USING btree ("owner_user_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "personal"."money_txn"
  ADD COLUMN IF NOT EXISTS "category_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "personal"."money_txn"
    ADD CONSTRAINT "money_txn_category_fk"
    FOREIGN KEY ("category_id") REFERENCES "personal"."category"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personal"."finance_export" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "from_on" date NOT NULL,
  "to_on" date NOT NULL,
  "status" text NOT NULL,
  "row_count" integer DEFAULT 0 NOT NULL,
  "csv_body" text,
  "error_detail" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "personal"."finance_export"
  ADD CONSTRAINT "personal_finance_export_owner_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personal_finance_export_owner_idempotency_uq"
  ON "personal"."finance_export" USING btree ("owner_user_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "personal"."category" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."category" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "personal_category_owner_all" ON "personal"."category";
--> statement-breakpoint
CREATE POLICY "personal_category_owner_all"
ON "personal"."category"
FOR ALL
USING ("owner_user_id" = "app"."current_user_id"())
WITH CHECK ("owner_user_id" = "app"."current_user_id"());
--> statement-breakpoint
ALTER TABLE "personal"."finance_export" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."finance_export" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "personal_finance_export_owner_all" ON "personal"."finance_export";
--> statement-breakpoint
CREATE POLICY "personal_finance_export_owner_all"
ON "personal"."finance_export"
FOR ALL
USING ("owner_user_id" = "app"."current_user_id"())
WITH CHECK ("owner_user_id" = "app"."current_user_id"());
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.category TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON personal.finance_export TO dang_runtime';
  END IF;
END $$;
