-- اجرای ۱۳b: payee exactly-one + composite fund FK (NOT VALID).
-- Do not add enum value creditor_approved here (already in 0095).
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "petty_cash_fund_workspace_id_uq"
  ON "finance"."petty_cash_fund" USING btree ("workspace_id", "id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_exactly_one_chk"
    CHECK (num_nonnulls("payee_user_id", "payee_fund_id") = 1)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_fund_workspace_fk"
    FOREIGN KEY ("workspace_id", "payee_fund_id")
    REFERENCES "finance"."petty_cash_fund"("workspace_id", "id")
    ON DELETE set null ON UPDATE no action
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
