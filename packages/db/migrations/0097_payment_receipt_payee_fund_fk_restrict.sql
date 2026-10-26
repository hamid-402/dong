-- اجرای ۱۳c: composite payee-fund FK → ON DELETE RESTRICT (still NOT VALID).
-- Drop legacy single-column FK (0095 SET NULL) so RESTRICT is not bypassed.
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  DROP CONSTRAINT IF EXISTS "payment_receipt_payee_fund_fk";
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  DROP CONSTRAINT IF EXISTS "payment_receipt_payee_fund_workspace_fk";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_fund_workspace_fk"
    FOREIGN KEY ("workspace_id", "payee_fund_id")
    REFERENCES "finance"."petty_cash_fund"("workspace_id", "id")
    ON DELETE RESTRICT ON UPDATE no action
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.petty_cash_fund TO dang_runtime';
  END IF;
END $$;
