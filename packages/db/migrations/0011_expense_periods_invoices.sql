-- Expense periods (day/week/month) + member invoices (draft → approve → issue)

DO $$ BEGIN
  CREATE TYPE "finance"."period_kind" AS ENUM('day', 'week', 'month', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."period_status" AS ENUM('open', 'review', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."expense_visibility" AS ENUM('shared', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."invoice_status" AS ENUM(
    'draft',
    'pending_approval',
    'disputed',
    'approved',
    'issued',
    'paid',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."expense_period" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "kind" "finance"."period_kind" NOT NULL,
  "status" "finance"."period_status" DEFAULT 'open' NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."expense_period"
  ADD CONSTRAINT "expense_period_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."expense_period"
  ADD CONSTRAINT "expense_period_created_by_user_id_user_account_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_period_idempotency_uq"
  ON "finance"."expense_period" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_period_workspace_range_idx"
  ON "finance"."expense_period" USING btree ("workspace_id", "starts_on", "ends_on");
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "period_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "visibility" "finance"."expense_visibility" DEFAULT 'shared' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."expense"
    ADD CONSTRAINT "expense_period_id_expense_period_id_fk"
    FOREIGN KEY ("period_id") REFERENCES "finance"."expense_period"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_period_id_idx"
  ON "finance"."expense" USING btree ("period_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."member_invoice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "member_user_id" uuid NOT NULL,
  "status" "finance"."invoice_status" DEFAULT 'draft' NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "shared_total_minor" bigint DEFAULT 0 NOT NULL,
  "private_total_minor" bigint DEFAULT 0 NOT NULL,
  "total_minor" bigint DEFAULT 0 NOT NULL,
  "dispute_note" text,
  "issued_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice"
  ADD CONSTRAINT "member_invoice_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice"
  ADD CONSTRAINT "member_invoice_period_id_expense_period_id_fk"
  FOREIGN KEY ("period_id") REFERENCES "finance"."expense_period"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice"
  ADD CONSTRAINT "member_invoice_member_user_id_user_account_id_fk"
  FOREIGN KEY ("member_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_invoice_idempotency_uq"
  ON "finance"."member_invoice" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_invoice_period_member_uq"
  ON "finance"."member_invoice" USING btree ("period_id", "member_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_invoice_workspace_status_idx"
  ON "finance"."member_invoice" USING btree ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."member_invoice_line" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "expense_id" uuid NOT NULL,
  "visibility" "finance"."expense_visibility" NOT NULL,
  "title" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "line_no" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD CONSTRAINT "member_invoice_line_invoice_id_member_invoice_id_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "finance"."member_invoice"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD CONSTRAINT "member_invoice_line_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD CONSTRAINT "member_invoice_line_expense_id_expense_id_fk"
  FOREIGN KEY ("expense_id") REFERENCES "finance"."expense"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_invoice_line_invoice_idx"
  ON "finance"."member_invoice_line" USING btree ("invoice_id", "line_no");
--> statement-breakpoint
ALTER TABLE "finance"."expense_period" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."expense_period" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "expense_period_tenant_select"
ON "finance"."expense_period" FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "expense_period_tenant_insert"
ON "finance"."expense_period" FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "expense_period_tenant_update"
ON "finance"."expense_period" FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "member_invoice_tenant_select"
ON "finance"."member_invoice" FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "member_invoice_tenant_insert"
ON "finance"."member_invoice" FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "member_invoice_tenant_update"
ON "finance"."member_invoice" FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "member_invoice_line_tenant_select"
ON "finance"."member_invoice_line" FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "member_invoice_line_tenant_insert"
ON "finance"."member_invoice_line" FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "member_invoice_line_tenant_update"
ON "finance"."member_invoice_line" FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
