-- اجرای ۱۳: card-to-card receipt two-step review, payee (member|fund), overpay credit.
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "finance"."payment_receipt_status" ADD VALUE IF NOT EXISTS 'creditor_approved';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD COLUMN IF NOT EXISTS "payee_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD COLUMN IF NOT EXISTS "payee_fund_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD COLUMN IF NOT EXISTS "creditor_approved_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD COLUMN IF NOT EXISTS "creditor_approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD COLUMN IF NOT EXISTS "excess_credit_minor" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  ADD COLUMN IF NOT EXISTS "applied_to_invoice_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_user_fk"
    FOREIGN KEY ("payee_user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_fund_fk"
    FOREIGN KEY ("payee_fund_id") REFERENCES "finance"."petty_cash_fund"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_creditor_approver_fk"
    FOREIGN KEY ("creditor_approved_by_user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_applied_invoice_fk"
    FOREIGN KEY ("applied_to_invoice_id") REFERENCES "finance"."member_invoice"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_xor_chk"
    CHECK (
      "payee_user_id" IS NULL
      OR "payee_fund_id" IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_excess_chk"
    CHECK ("excess_credit_minor" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_receipt_unapplied_credit_idx"
  ON "finance"."payment_receipt" USING btree ("workspace_id", "excess_credit_minor")
  WHERE "excess_credit_minor" > 0 AND "applied_to_invoice_id" IS NULL AND "status" = 'approved';
--> statement-breakpoint
-- RLS already FORCE on payment_receipt (0052); keep tenant policy intact.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.payment_receipt TO dang_runtime';
  END IF;
END $$;
