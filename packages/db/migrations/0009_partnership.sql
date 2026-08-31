CREATE SCHEMA IF NOT EXISTS "partnership";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "partnership"."agreement_status" AS ENUM('draft', 'active', 'superseded', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "partnership"."contribution_kind" AS ENUM('cash', 'in_kind');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "partnership"."partner_loan_status" AS ENUM('open', 'partially_repaid', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partnership"."agreement" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "status" "partnership"."agreement_status" DEFAULT 'draft' NOT NULL,
  "effective_from" date NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership"."agreement"
  ADD CONSTRAINT "agreement_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agreement_idempotency_uq"
  ON "partnership"."agreement" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partnership"."contribution" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "agreement_id" uuid NOT NULL,
  "member_user_id" uuid NOT NULL,
  "kind" "partnership"."contribution_kind" NOT NULL,
  "amount_minor" bigint,
  "currency" text DEFAULT 'IRR',
  "description" text,
  "idempotency_key" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership"."contribution"
  ADD CONSTRAINT "contribution_agreement_id_fk"
  FOREIGN KEY ("agreement_id") REFERENCES "partnership"."agreement"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partnership"."partner_loan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "agreement_id" uuid NOT NULL,
  "lender_user_id" uuid NOT NULL,
  "borrower_user_id" uuid NOT NULL,
  "principal_minor" bigint NOT NULL,
  "repaid_minor" bigint DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "status" "partnership"."partner_loan_status" DEFAULT 'open' NOT NULL,
  "idempotency_key" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership"."partner_loan"
  ADD CONSTRAINT "loan_agreement_id_fk"
  FOREIGN KEY ("agreement_id") REFERENCES "partnership"."agreement"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partnership"."withdrawal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "agreement_id" uuid NOT NULL,
  "member_user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "reason" text,
  "idempotency_key" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership"."withdrawal"
  ADD CONSTRAINT "withdrawal_agreement_id_fk"
  FOREIGN KEY ("agreement_id") REFERENCES "partnership"."agreement"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "partnership"."agreement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partnership"."agreement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "agreement_tenant_all"
ON "partnership"."agreement"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "partnership"."contribution" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partnership"."contribution" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contribution_tenant_all"
ON "partnership"."contribution"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "partnership"."partner_loan" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partnership"."partner_loan" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "loan_tenant_all"
ON "partnership"."partner_loan"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "partnership"."withdrawal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partnership"."withdrawal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "withdrawal_tenant_all"
ON "partnership"."withdrawal"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
