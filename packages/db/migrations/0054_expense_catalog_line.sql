-- Stage 11 / S11-07: catalog snapshot on expense lines (free-text path remains NULL).
-- Additive columns only — no rewrite of existing rows.

ALTER TABLE "finance"."expense_item"
  ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid,
  ADD COLUMN IF NOT EXISTS "unit_code" text,
  ADD COLUMN IF NOT EXISTS "quantity" numeric(18, 3),
  ADD COLUMN IF NOT EXISTS "unit_price_minor" bigint;

ALTER TABLE "finance"."expense"
  ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid,
  ADD COLUMN IF NOT EXISTS "unit_code" text,
  ADD COLUMN IF NOT EXISTS "quantity" numeric(18, 3),
  ADD COLUMN IF NOT EXISTS "unit_price_minor" bigint;

DO $$ BEGIN
  ALTER TABLE "finance"."expense_item"
    ADD CONSTRAINT "expense_item_catalog_item_id_fk"
    FOREIGN KEY ("catalog_item_id") REFERENCES "catalog"."catalog_item"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "finance"."expense"
    ADD CONSTRAINT "expense_catalog_item_id_fk"
    FOREIGN KEY ("catalog_item_id") REFERENCES "catalog"."catalog_item"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "expense_item_catalog_item_idx"
  ON "finance"."expense_item" ("workspace_id", "catalog_item_id")
  WHERE "catalog_item_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "expense_catalog_item_idx"
  ON "finance"."expense" ("workspace_id", "catalog_item_id")
  WHERE "catalog_item_id" IS NOT NULL;
