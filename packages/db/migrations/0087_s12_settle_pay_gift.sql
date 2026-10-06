-- S12: business-date on journal for asOf; distinct gift movement kind.
-- Migrator role is subject to FORCE RLS; disable briefly so backfill sees all rows.

ALTER TABLE "accounting"."journal_entry" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "accounting"."journal_entry"
  ADD COLUMN IF NOT EXISTS "occurred_on" date;

UPDATE "accounting"."journal_entry"
  SET "occurred_on" = COALESCE(
    ("created_at" AT TIME ZONE 'UTC')::date,
    CURRENT_DATE
  )
  WHERE "occurred_on" IS NULL;

ALTER TABLE "accounting"."journal_entry"
  ALTER COLUMN "occurred_on" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "journal_entry_workspace_occurred_idx"
  ON "accounting"."journal_entry" USING btree ("workspace_id", "occurred_on");

ALTER TABLE "accounting"."journal_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounting"."journal_entry" FORCE ROW LEVEL SECURITY;

ALTER TYPE "finance"."petty_cash_movement_kind" ADD VALUE IF NOT EXISTS 'gift';
