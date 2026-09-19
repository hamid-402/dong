-- Stage 11 / S11-09: payment receipts, petty cash, credit purchases, expense funding.

DO $$ BEGIN
  CREATE TYPE "finance"."payment_receipt_method" AS ENUM(
    'card_to_card', 'cash', 'bank_transfer', 'gateway'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."payment_receipt_status" AS ENUM(
    'submitted', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."petty_cash_movement_kind" AS ENUM(
    'topup', 'spend', 'return', 'adjust'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."credit_purchase_status" AS ENUM(
    'open', 'partially_paid', 'paid', 'overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "funding_source_kind" text;
--> statement-breakpoint
ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "funding_ref_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "accounting"."journal_source_type" ADD VALUE IF NOT EXISTS 'payment_receipt';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."payment_receipt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "settlement_id" uuid,
  "member_invoice_id" uuid,
  "payer_user_id" uuid NOT NULL,
  "method" "finance"."payment_receipt_method" NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "paid_at" timestamp with time zone NOT NULL,
  "reference_no" text,
  "dest_holder_name" text,
  "dest_last4" text,
  "attachment_id" uuid,
  "status" "finance"."payment_receipt_status" DEFAULT 'submitted' NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "journal_entry_id" uuid,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_receipt_amount_chk" CHECK ("amount_minor" > 0),
  CONSTRAINT "payment_receipt_last4_chk" CHECK (
    "dest_last4" IS NULL OR "dest_last4" ~ '^[0-9]{4}$'
  )
);
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD CONSTRAINT "payment_receipt_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD CONSTRAINT "payment_receipt_settlement_fk"
  FOREIGN KEY ("settlement_id") REFERENCES "finance"."settlement"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD CONSTRAINT "payment_receipt_invoice_fk"
  FOREIGN KEY ("member_invoice_id") REFERENCES "finance"."member_invoice"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD CONSTRAINT "payment_receipt_payer_fk"
  FOREIGN KEY ("payer_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD CONSTRAINT "payment_receipt_attachment_fk"
  FOREIGN KEY ("attachment_id") REFERENCES "collab"."attachment"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD CONSTRAINT "payment_receipt_reviewer_fk"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_receipt_idempotency_uq"
  ON "finance"."payment_receipt" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_receipt_workspace_status_idx"
  ON "finance"."payment_receipt" USING btree ("workspace_id", "status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."petty_cash_fund" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "custodian_user_id" uuid NOT NULL,
  "opening_balance_minor" bigint DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_fund"
  ADD CONSTRAINT "petty_cash_fund_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_fund"
  ADD CONSTRAINT "petty_cash_fund_custodian_fk"
  FOREIGN KEY ("custodian_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_fund"
  ADD CONSTRAINT "petty_cash_fund_creator_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_fund_idempotency_uq"
  ON "finance"."petty_cash_fund" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petty_cash_fund_workspace_idx"
  ON "finance"."petty_cash_fund" USING btree ("workspace_id", "active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."petty_cash_movement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fund_id" uuid NOT NULL,
  "kind" "finance"."petty_cash_movement_kind" NOT NULL,
  "amount_minor" bigint NOT NULL,
  "expense_id" uuid,
  "settlement_id" uuid,
  "actor_user_id" uuid NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "petty_cash_movement_amount_chk" CHECK ("amount_minor" <> 0)
);
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_movement"
  ADD CONSTRAINT "petty_cash_movement_fund_fk"
  FOREIGN KEY ("fund_id") REFERENCES "finance"."petty_cash_fund"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_movement"
  ADD CONSTRAINT "petty_cash_movement_expense_fk"
  FOREIGN KEY ("expense_id") REFERENCES "finance"."expense"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_movement"
  ADD CONSTRAINT "petty_cash_movement_settlement_fk"
  FOREIGN KEY ("settlement_id") REFERENCES "finance"."settlement"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_movement"
  ADD CONSTRAINT "petty_cash_movement_actor_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_movement_idempotency_uq"
  ON "finance"."petty_cash_movement" USING btree ("fund_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "petty_cash_movement_fund_idx"
  ON "finance"."petty_cash_movement" USING btree ("fund_id", "occurred_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."credit_purchase" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "supplier_ref" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "purchased_at" timestamp with time zone NOT NULL,
  "due_date" date NOT NULL,
  "status" "finance"."credit_purchase_status" DEFAULT 'open' NOT NULL,
  "expense_id" uuid,
  "created_by_user_id" uuid NOT NULL,
  "note" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_purchase_amount_chk" CHECK ("amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase"
  ADD CONSTRAINT "credit_purchase_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase"
  ADD CONSTRAINT "credit_purchase_expense_fk"
  FOREIGN KEY ("expense_id") REFERENCES "finance"."expense"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase"
  ADD CONSTRAINT "credit_purchase_creator_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_purchase_idempotency_uq"
  ON "finance"."credit_purchase" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_purchase_workspace_status_idx"
  ON "finance"."credit_purchase" USING btree ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."credit_purchase_payment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "credit_purchase_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "paid_at" timestamp with time zone NOT NULL,
  "source_kind" text NOT NULL,
  "source_ref_id" uuid,
  "actor_user_id" uuid NOT NULL,
  "receipt_id" uuid,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_purchase_payment_amount_chk" CHECK ("amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase_payment"
  ADD CONSTRAINT "credit_purchase_payment_purchase_fk"
  FOREIGN KEY ("credit_purchase_id") REFERENCES "finance"."credit_purchase"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase_payment"
  ADD CONSTRAINT "credit_purchase_payment_actor_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase_payment"
  ADD CONSTRAINT "credit_purchase_payment_receipt_fk"
  FOREIGN KEY ("receipt_id") REFERENCES "finance"."payment_receipt"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_purchase_payment_idempotency_uq"
  ON "finance"."credit_purchase_payment" USING btree ("credit_purchase_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_purchase_payment_purchase_idx"
  ON "finance"."credit_purchase_payment" USING btree ("credit_purchase_id", "paid_at");
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "payment_receipt_tenant_all"
  ON "finance"."payment_receipt"
  FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_fund" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_fund" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "petty_cash_fund_tenant_all"
  ON "finance"."petty_cash_fund"
  FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_movement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."petty_cash_movement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "petty_cash_movement_tenant_all"
  ON "finance"."petty_cash_movement"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "finance"."petty_cash_fund" f
      WHERE f."id" = "fund_id"
        AND f."workspace_id" = "app"."current_workspace_id"()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "finance"."petty_cash_fund" f
      WHERE f."id" = "fund_id"
        AND f."workspace_id" = "app"."current_workspace_id"()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "credit_purchase_tenant_all"
  ON "finance"."credit_purchase"
  FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase_payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."credit_purchase_payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "credit_purchase_payment_tenant_all"
  ON "finance"."credit_purchase_payment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "finance"."credit_purchase" c
      WHERE c."id" = "credit_purchase_id"
        AND c."workspace_id" = "app"."current_workspace_id"()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "finance"."credit_purchase" c
      WHERE c."id" = "credit_purchase_id"
        AND c."workspace_id" = "app"."current_workspace_id"()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.payment_receipt TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.petty_cash_fund TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.petty_cash_movement TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.credit_purchase TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.credit_purchase_payment TO dang_runtime';
  END IF;
END $$;
