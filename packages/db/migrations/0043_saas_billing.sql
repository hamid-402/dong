-- Stage 10 / R10-21: platform subscription invoices (not group member invoices).

CREATE SCHEMA IF NOT EXISTS "saas";

CREATE TABLE IF NOT EXISTS "saas"."subscription_invoice" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "period_month" text NOT NULL,
  "target_plan" text NOT NULL,
  "amount_minor" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'IRR',
  "status" text NOT NULL,
  "payment_link_id" uuid,
  "paid_at" timestamptz,
  "idempotency_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "note" text NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS "saas_sub_inv_idempotency_uq"
  ON "saas"."subscription_invoice" ("workspace_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "saas_sub_inv_workspace_idx"
  ON "saas"."subscription_invoice" ("workspace_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "saas"."subscription_payment_map" (
  "payment_link_id" uuid PRIMARY KEY,
  "subscription_invoice_id" uuid NOT NULL REFERENCES "saas"."subscription_invoice"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "saas"."subscription_invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas"."subscription_invoice" FORCE ROW LEVEL SECURITY;
ALTER TABLE "saas"."subscription_payment_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saas"."subscription_payment_map" FORCE ROW LEVEL SECURITY;

CREATE POLICY "saas_sub_inv_select"
ON "saas"."subscription_invoice" FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "saas_sub_inv_insert"
ON "saas"."subscription_invoice" FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "saas_sub_inv_update"
ON "saas"."subscription_invoice" FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "saas_pay_map_select"
ON "saas"."subscription_payment_map" FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());

CREATE POLICY "saas_pay_map_insert"
ON "saas"."subscription_payment_map" FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA saas TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON saas.subscription_invoice TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON saas.subscription_payment_map TO dang_runtime';
  END IF;
END
$$;
