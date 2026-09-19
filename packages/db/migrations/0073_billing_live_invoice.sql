-- Live draft member invoices: period cadence/rollover, invoice projection
-- bookkeeping, and immutable-document correction notices.

ALTER TABLE "finance"."expense_period"
  ADD COLUMN IF NOT EXISTS "cadence" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "finance"."expense_period"
  ADD COLUMN IF NOT EXISTS "auto_rollover" boolean DEFAULT false NOT NULL;

ALTER TABLE "finance"."member_invoice"
  ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "finance"."member_invoice"
  ADD COLUMN IF NOT EXISTS "recalculated_at" timestamptz;
ALTER TABLE "finance"."member_invoice"
  ADD COLUMN IF NOT EXISTS "source_hash" text;

CREATE TABLE IF NOT EXISTS "finance"."member_invoice_adjustment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "invoice_id" uuid NOT NULL REFERENCES "finance"."member_invoice"("id") ON DELETE cascade,
  "period_id" uuid NOT NULL REFERENCES "finance"."expense_period"("id") ON DELETE cascade,
  "member_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "delta_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "reason" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "member_invoice_adjustment_idempotency_uq"
  ON "finance"."member_invoice_adjustment" ("workspace_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "member_invoice_adjustment_invoice_idx"
  ON "finance"."member_invoice_adjustment" ("invoice_id", "created_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.member_invoice_adjustment TO dang_runtime';
  END IF;
END
$$;

ALTER TABLE "finance"."member_invoice_adjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."member_invoice_adjustment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member_invoice_adjustment_tenant_all"
  ON "finance"."member_invoice_adjustment";
CREATE POLICY "member_invoice_adjustment_tenant_all"
  ON "finance"."member_invoice_adjustment" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
