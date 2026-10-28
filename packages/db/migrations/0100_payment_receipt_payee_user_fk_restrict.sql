-- Run 17 / phase 0: payee_user_id FK → ON DELETE RESTRICT (additive, NOT VALID).
-- Drop legacy SET NULL FK from 0095 so RESTRICT cannot be bypassed.
-- VALIDATE CONSTRAINT is a prod step — see docs/RELEASE-CHECKLIST.md (do not VALIDATE here).
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance"."payment_receipt"
    ADD CONSTRAINT "payment_receipt_payee_user_fk_restrict"
    FOREIGN KEY ("payee_user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE RESTRICT ON UPDATE no action
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "finance"."payment_receipt"
  DROP CONSTRAINT IF EXISTS "payment_receipt_payee_user_fk";
