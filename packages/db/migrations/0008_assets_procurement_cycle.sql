CREATE SCHEMA IF NOT EXISTS "asset";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "asset"."asset_status" AS ENUM('active', 'returned', 'damaged', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "asset"."purchase_order_status" AS ENUM('open', 'partially_delivered', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "asset"."delivery_status" AS ENUM('complete', 'partial', 'discrepancy');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset"."vendor" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "contact_phone" text,
  "contact_email" text,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset"."vendor"
  ADD CONSTRAINT "vendor_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_idempotency_uq"
  ON "asset"."vendor" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset"."purchase_order" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "purchase_request_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "title" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "status" "asset"."purchase_order_status" DEFAULT 'open' NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset"."purchase_order"
  ADD CONSTRAINT "po_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset"."purchase_order"
  ADD CONSTRAINT "po_purchase_request_id_fk"
  FOREIGN KEY ("purchase_request_id") REFERENCES "procurement"."purchase_request"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset"."purchase_order"
  ADD CONSTRAINT "po_vendor_id_fk"
  FOREIGN KEY ("vendor_id") REFERENCES "asset"."vendor"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "po_idempotency_uq"
  ON "asset"."purchase_order" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset"."delivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "expected_quantity" integer NOT NULL,
  "received_quantity" integer NOT NULL,
  "status" "asset"."delivery_status" NOT NULL,
  "discrepancy_note" text,
  "recorded_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset"."delivery"
  ADD CONSTRAINT "delivery_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset"."delivery"
  ADD CONSTRAINT "delivery_purchase_order_id_fk"
  FOREIGN KEY ("purchase_order_id") REFERENCES "asset"."purchase_order"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_idempotency_uq"
  ON "asset"."delivery" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset"."asset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "serial_number" text,
  "purchase_order_id" uuid,
  "delivery_id" uuid,
  "acquisition_cost_minor" bigint,
  "currency" text DEFAULT 'IRR',
  "owner_user_id" uuid,
  "custodian_user_id" uuid,
  "location" text,
  "status" "asset"."asset_status" DEFAULT 'active' NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset"."asset"
  ADD CONSTRAINT "asset_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset"."vendor" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asset"."vendor" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "vendor_tenant_all"
ON "asset"."vendor"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "asset"."purchase_order" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asset"."purchase_order" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "po_tenant_all"
ON "asset"."purchase_order"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "asset"."delivery" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asset"."delivery" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "delivery_tenant_all"
ON "asset"."delivery"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "asset"."asset" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "asset"."asset" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "asset_tenant_all"
ON "asset"."asset"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
