-- G10: PO price pins, expense link, partnership agreed prices, asset depreciation / in_repair
DO $$ BEGIN
  ALTER TYPE "asset"."asset_status" ADD VALUE 'in_repair';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "asset"."purchase_order"
  ADD COLUMN IF NOT EXISTS "expense_id" uuid,
  ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid,
  ADD COLUMN IF NOT EXISTS "catalog_price_id" uuid,
  ADD COLUMN IF NOT EXISTS "partner_price_id" uuid;
--> statement-breakpoint
ALTER TABLE "asset"."asset"
  ADD COLUMN IF NOT EXISTS "useful_life_months" integer,
  ADD COLUMN IF NOT EXISTS "salvage_minor" bigint,
  ADD COLUMN IF NOT EXISTS "accumulated_depreciation_minor" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_depreciated_on" date,
  ADD COLUMN IF NOT EXISTS "acquisition_date" date;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partnership"."agreed_price" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "agreement_id" uuid NOT NULL,
  "catalog_item_id" uuid,
  "title" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "effective_from" date NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership"."agreed_price"
  ADD CONSTRAINT "agreed_price_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "partnership"."agreed_price"
  ADD CONSTRAINT "agreed_price_agreement_id_fk"
  FOREIGN KEY ("agreement_id") REFERENCES "partnership"."agreement"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agreed_price_idempotency_uq"
  ON "partnership"."agreed_price" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "partnership"."agreed_price" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "agreed_price_tenant" ON "partnership"."agreed_price"
    USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
