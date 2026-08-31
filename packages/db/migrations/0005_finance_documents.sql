CREATE SCHEMA IF NOT EXISTS "finance";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."expense_status" AS ENUM('draft', 'submitted', 'posted', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."split_method" AS ENUM('equal', 'amount', 'percent', 'shares');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."settlement_status" AS ENUM('claimed', 'confirmed', 'disputed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."expense" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "note" text,
  "status" "finance"."expense_status" DEFAULT 'draft' NOT NULL,
  "total_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "paid_by_user_id" uuid NOT NULL,
  "split_method" "finance"."split_method" NOT NULL,
  "occurred_on" date NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD CONSTRAINT "expense_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD CONSTRAINT "expense_paid_by_user_id_user_account_id_fk"
  FOREIGN KEY ("paid_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD CONSTRAINT "expense_created_by_user_id_user_account_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_idempotency_uq"
  ON "finance"."expense" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_workspace_time_idx"
  ON "finance"."expense" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."expense_split_line" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "percent_bp" integer,
  "shares" integer,
  "line_no" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."expense_split_line"
  ADD CONSTRAINT "expense_split_line_expense_id_expense_id_fk"
  FOREIGN KEY ("expense_id") REFERENCES "finance"."expense"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense_split_line"
  ADD CONSTRAINT "expense_split_line_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense_split_line"
  ADD CONSTRAINT "expense_split_line_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_split_expense_idx"
  ON "finance"."expense_split_line" USING btree ("expense_id", "line_no");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."expense_payment_line" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "line_no" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."expense_payment_line"
  ADD CONSTRAINT "expense_payment_line_expense_id_expense_id_fk"
  FOREIGN KEY ("expense_id") REFERENCES "finance"."expense"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense_payment_line"
  ADD CONSTRAINT "expense_payment_line_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense_payment_line"
  ADD CONSTRAINT "expense_payment_line_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_payment_expense_idx"
  ON "finance"."expense_payment_line" USING btree ("expense_id", "line_no");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."settlement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "from_user_id" uuid NOT NULL,
  "to_user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "status" "finance"."settlement_status" DEFAULT 'claimed' NOT NULL,
  "payment_link_url" text,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."settlement"
  ADD CONSTRAINT "settlement_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."settlement"
  ADD CONSTRAINT "settlement_from_user_id_user_account_id_fk"
  FOREIGN KEY ("from_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."settlement"
  ADD CONSTRAINT "settlement_to_user_id_user_account_id_fk"
  FOREIGN KEY ("to_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."settlement"
  ADD CONSTRAINT "settlement_created_by_user_id_user_account_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_idempotency_uq"
  ON "finance"."settlement" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_workspace_time_idx"
  ON "finance"."settlement" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
ALTER TABLE "finance"."expense" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."expense" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "expense_tenant_select"
ON "finance"."expense"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "expense_tenant_insert"
ON "finance"."expense"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "expense_tenant_update"
ON "finance"."expense"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "finance"."expense_split_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."expense_split_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "expense_split_tenant_select"
ON "finance"."expense_split_line"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "expense_split_tenant_insert"
ON "finance"."expense_split_line"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "finance"."expense_payment_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."expense_payment_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "expense_payment_tenant_select"
ON "finance"."expense_payment_line"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "expense_payment_tenant_insert"
ON "finance"."expense_payment_line"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "finance"."settlement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."settlement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "settlement_tenant_select"
ON "finance"."settlement"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "settlement_tenant_insert"
ON "finance"."settlement"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "settlement_tenant_update"
ON "finance"."settlement"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
