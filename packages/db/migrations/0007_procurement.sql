CREATE SCHEMA IF NOT EXISTS "procurement";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "procurement"."need_status" AS ENUM('open', 'fulfilled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "procurement"."purchase_request_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'ordered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "procurement"."budget_status" AS ENUM('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement"."need" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "estimated_amount_minor" bigint,
  "currency" text DEFAULT 'IRR',
  "status" "procurement"."need_status" DEFAULT 'open' NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procurement"."need"
  ADD CONSTRAINT "need_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "need_idempotency_uq"
  ON "procurement"."need" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement"."purchase_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "need_id" uuid,
  "title" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "vendor_name" text,
  "status" "procurement"."purchase_request_status" DEFAULT 'draft' NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procurement"."purchase_request"
  ADD CONSTRAINT "pr_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "procurement"."purchase_request"
  ADD CONSTRAINT "pr_need_id_need_id_fk"
  FOREIGN KEY ("need_id") REFERENCES "procurement"."need"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pr_idempotency_uq"
  ON "procurement"."purchase_request" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement"."budget" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "ceiling_minor" bigint NOT NULL,
  "committed_minor" bigint DEFAULT 0 NOT NULL,
  "spent_minor" bigint DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" "procurement"."budget_status" DEFAULT 'open' NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procurement"."budget"
  ADD CONSTRAINT "budget_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_idempotency_uq"
  ON "procurement"."budget" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "procurement"."need" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "procurement"."need" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "need_tenant_all"
ON "procurement"."need"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "procurement"."purchase_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "procurement"."purchase_request" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pr_tenant_all"
ON "procurement"."purchase_request"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "procurement"."budget" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "procurement"."budget" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "budget_tenant_all"
ON "procurement"."budget"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
