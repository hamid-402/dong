-- Additive RLS for pending PSP tables (LocalPSP + Zarinpal).
-- Public checkout/callback keep working via capability GUCs for dang_runtime:
--   app.local_psp_intent_id / app.zarinpal_authority
-- Tenant path uses app.current_workspace_id() as usual.
-- Scope: pending PSP RLS only. Payee FK / RESTRICT work is run 17 (0099).

ALTER TABLE "finance"."pending_local_psp_payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."pending_local_psp_payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."pending_zarinpal_payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."pending_zarinpal_payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "pending_local_psp_dang_runtime"
        ON "finance"."pending_local_psp_payment"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "pending_local_psp_dang_runtime"
      ON "finance"."pending_local_psp_payment"
      FOR ALL
      TO dang_runtime
      USING (
        "workspace_id" = "app"."current_workspace_id"()
        OR "intent_id" = NULLIF(pg_catalog.current_setting('app.local_psp_intent_id', true), '')
      )
      WITH CHECK (
        "workspace_id" = "app"."current_workspace_id"()
        OR "intent_id" = NULLIF(pg_catalog.current_setting('app.local_psp_intent_id', true), '')
      )
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "pending_zarinpal_dang_runtime"
        ON "finance"."pending_zarinpal_payment"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "pending_zarinpal_dang_runtime"
      ON "finance"."pending_zarinpal_payment"
      FOR ALL
      TO dang_runtime
      USING (
        "workspace_id" = "app"."current_workspace_id"()
        OR "authority" = NULLIF(pg_catalog.current_setting('app.zarinpal_authority', true), '')
      )
      WITH CHECK (
        "workspace_id" = "app"."current_workspace_id"()
        OR "authority" = NULLIF(pg_catalog.current_setting('app.zarinpal_authority', true), '')
      )
    $pol$;

    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.pending_local_psp_payment TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.pending_zarinpal_payment TO dang_runtime';
  END IF;
END $$;
