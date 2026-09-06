DO $$ BEGIN
  CREATE TYPE "finance"."payment_link_status" AS ENUM(
    'created', 'opened', 'paid', 'failed', 'expired', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "finance"."payment_provider" AS ENUM('stub', 'zarinpal', 'idpay');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."payment_link" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "settlement_id" uuid,
  "invoice_id" uuid,
  "provider" "finance"."payment_provider" NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "description" text NOT NULL,
  "checkout_url" text NOT NULL,
  "status" "finance"."payment_link_status" DEFAULT 'created' NOT NULL,
  "provider_ref" text NOT NULL,
  "return_url" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."payment_link"
  ADD CONSTRAINT "payment_link_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_link"
  ADD CONSTRAINT "payment_link_settlement_id_fk"
  FOREIGN KEY ("settlement_id") REFERENCES "finance"."settlement"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance"."payment_link"
  ADD CONSTRAINT "payment_link_invoice_id_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "finance"."member_invoice"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_link_idempotency_uq"
  ON "finance"."payment_link" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_link_workspace_created_idx"
  ON "finance"."payment_link" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
ALTER TABLE "finance"."payment_link" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."payment_link" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "payment_link_tenant_all"
  ON "finance"."payment_link"
  FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.payment_link TO dang_runtime';
  END IF;
END $$;
