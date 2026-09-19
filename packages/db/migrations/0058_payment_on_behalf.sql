-- Stage 11 / S11-09 depth: pay on behalf of another member.

DO $$ BEGIN
  CREATE TYPE "finance"."payment_on_behalf_status" AS ENUM(
    'pending', 'approved', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "accounting"."journal_source_type" ADD VALUE IF NOT EXISTS 'payment_on_behalf';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."payment_on_behalf" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "debtor_user_id" uuid NOT NULL,
  "payer_user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "settlement_id" uuid,
  "method" "finance"."payment_receipt_method" NOT NULL,
  "note" text,
  "status" "finance"."payment_on_behalf_status" DEFAULT 'pending' NOT NULL,
  "initiated_by_user_id" uuid NOT NULL,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "reject_note" text,
  "journal_entry_id" uuid,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_on_behalf_amount_chk" CHECK ("amount_minor" > 0),
  CONSTRAINT "payment_on_behalf_parties_chk" CHECK ("debtor_user_id" <> "payer_user_id")
);
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf"
  ADD CONSTRAINT "payment_on_behalf_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf"
  ADD CONSTRAINT "payment_on_behalf_debtor_fk"
  FOREIGN KEY ("debtor_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf"
  ADD CONSTRAINT "payment_on_behalf_payer_fk"
  FOREIGN KEY ("payer_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf"
  ADD CONSTRAINT "payment_on_behalf_settlement_fk"
  FOREIGN KEY ("settlement_id") REFERENCES "finance"."settlement"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf"
  ADD CONSTRAINT "payment_on_behalf_initiator_fk"
  FOREIGN KEY ("initiated_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf"
  ADD CONSTRAINT "payment_on_behalf_approver_fk"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_on_behalf_idempotency_uq"
  ON "finance"."payment_on_behalf" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_on_behalf_workspace_status_idx"
  ON "finance"."payment_on_behalf" USING btree ("workspace_id", "status", "created_at");
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."payment_on_behalf" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "payment_on_behalf_tenant_all"
  ON "finance"."payment_on_behalf"
  FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.payment_on_behalf TO dang_runtime';
  END IF;
END $$;
