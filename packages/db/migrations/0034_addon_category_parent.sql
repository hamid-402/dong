-- Dong 2.0 Wave 1 (A باریک): hierarchical categories + personal_addon_charge skeleton
-- Law 3: Migration + RLS (+ grants) in the same change; invariant tests live in @dang/contracts.

ALTER TABLE "finance"."expense_category"
  ADD COLUMN IF NOT EXISTS "parent_id" uuid;

DO $$ BEGIN
  ALTER TABLE "finance"."expense_category"
    ADD CONSTRAINT "expense_category_parent_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "finance"."expense_category"("id")
    ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "expense_category_workspace_parent_idx"
  ON "finance"."expense_category" ("workspace_id", "parent_id");

DO $$ BEGIN
  CREATE TYPE "finance"."addon_charge_status" AS ENUM(
    'pending_ack',
    'confirmed',
    'disputed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "finance"."personal_addon_charge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "target_member_user_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "title" text NOT NULL,
  "note" text,
  "category_id" uuid,
  "linked_expense_id" uuid,
  "status" "finance"."addon_charge_status" DEFAULT 'pending_ack' NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "finance"."personal_addon_charge"
  ADD CONSTRAINT "personal_addon_charge_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade;

ALTER TABLE "finance"."personal_addon_charge"
  ADD CONSTRAINT "personal_addon_charge_target_fk"
  FOREIGN KEY ("target_member_user_id") REFERENCES "iam"."user_account"("id");

ALTER TABLE "finance"."personal_addon_charge"
  ADD CONSTRAINT "personal_addon_charge_created_by_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id");

DO $$ BEGIN
  ALTER TABLE "finance"."personal_addon_charge"
    ADD CONSTRAINT "personal_addon_charge_category_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "finance"."expense_category"("id")
    ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "finance"."personal_addon_charge"
    ADD CONSTRAINT "personal_addon_charge_linked_expense_fk"
    FOREIGN KEY ("linked_expense_id") REFERENCES "finance"."expense"("id")
    ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "finance"."personal_addon_charge"
  ADD CONSTRAINT "personal_addon_charge_amount_positive"
  CHECK ("amount_minor" > 0);

CREATE UNIQUE INDEX IF NOT EXISTS "personal_addon_charge_idempotency_uq"
  ON "finance"."personal_addon_charge" ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "personal_addon_charge_workspace_status_idx"
  ON "finance"."personal_addon_charge" ("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "personal_addon_charge_target_idx"
  ON "finance"."personal_addon_charge" ("workspace_id", "target_member_user_id");

ALTER TABLE "finance"."personal_addon_charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."personal_addon_charge" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_addon_charge_tenant_all" ON "finance"."personal_addon_charge";
CREATE POLICY "personal_addon_charge_tenant_all" ON "finance"."personal_addon_charge" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.personal_addon_charge TO dang_runtime';
  END IF;
END $$;
