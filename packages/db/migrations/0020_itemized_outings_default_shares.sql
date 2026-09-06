-- Phase 1b: itemized split, outing (multi-expense), default membership shares
ALTER TYPE "finance"."split_method" ADD VALUE IF NOT EXISTS 'itemized';

ALTER TABLE "iam"."membership"
  ADD COLUMN IF NOT EXISTS "default_shares" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "finance"."outing" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "title" text NOT NULL,
  "note" text,
  "occurred_on" date NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "finance"."outing"
  ADD CONSTRAINT "outing_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "finance"."outing"
  ADD CONSTRAINT "outing_created_by_user_id_user_account_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "outing_idempotency_uq"
  ON "finance"."outing" USING btree ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "outing_workspace_time_idx"
  ON "finance"."outing" USING btree ("workspace_id", "created_at");

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "outing_id" uuid,
  ADD COLUMN IF NOT EXISTS "tip_minor" bigint,
  ADD COLUMN IF NOT EXISTS "tax_minor" bigint,
  ADD COLUMN IF NOT EXISTS "discount_minor" bigint;

DO $$ BEGIN
  ALTER TABLE "finance"."expense"
    ADD CONSTRAINT "expense_outing_id_outing_id_fk"
    FOREIGN KEY ("outing_id") REFERENCES "finance"."outing"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "expense_outing_id_idx"
  ON "finance"."expense" USING btree ("outing_id");

CREATE TABLE IF NOT EXISTS "finance"."expense_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "title" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "notes" text
);

ALTER TABLE "finance"."expense_item"
  ADD CONSTRAINT "expense_item_expense_id_expense_id_fk"
  FOREIGN KEY ("expense_id") REFERENCES "finance"."expense"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "finance"."expense_item"
  ADD CONSTRAINT "expense_item_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "expense_item_expense_idx"
  ON "finance"."expense_item" USING btree ("expense_id", "line_no");

CREATE TABLE IF NOT EXISTS "finance"."expense_item_assignment" (
  "item_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "shares" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "expense_item_assignment_pk" PRIMARY KEY ("item_id", "user_id")
);

ALTER TABLE "finance"."expense_item_assignment"
  ADD CONSTRAINT "expense_item_assignment_item_id_fk"
  FOREIGN KEY ("item_id") REFERENCES "finance"."expense_item"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "finance"."expense_item_assignment"
  ADD CONSTRAINT "expense_item_assignment_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "finance"."outing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."outing" FORCE ROW LEVEL SECURITY;
CREATE POLICY "outing_tenant_select" ON "finance"."outing" FOR SELECT
  USING ("workspace_id" = "app"."current_workspace_id"());
CREATE POLICY "outing_tenant_insert" ON "finance"."outing" FOR INSERT
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
CREATE POLICY "outing_tenant_update" ON "finance"."outing" FOR UPDATE
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
CREATE POLICY "outing_tenant_delete" ON "finance"."outing" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());

ALTER TABLE "finance"."expense_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."expense_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expense_item_tenant_select" ON "finance"."expense_item" FOR SELECT
  USING ("workspace_id" = "app"."current_workspace_id"());
CREATE POLICY "expense_item_tenant_insert" ON "finance"."expense_item" FOR INSERT
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
CREATE POLICY "expense_item_tenant_update" ON "finance"."expense_item" FOR UPDATE
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
CREATE POLICY "expense_item_tenant_delete" ON "finance"."expense_item" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());

ALTER TABLE "finance"."expense_item_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."expense_item_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expense_item_assignment_tenant_all" ON "finance"."expense_item_assignment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "finance"."expense_item" ei
      WHERE ei.id = "item_id" AND ei.workspace_id = "app"."current_workspace_id"()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "finance"."expense_item" ei
      WHERE ei.id = "item_id" AND ei.workspace_id = "app"."current_workspace_id"()
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.outing TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_item TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_item_assignment TO dang_runtime';
  END IF;
END $$;
