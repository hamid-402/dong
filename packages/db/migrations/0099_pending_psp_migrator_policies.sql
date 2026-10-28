-- Additive: mirror 0098 dang_runtime pending_* policies for dang_migrator
-- (app DATABASE_URL role). No FORCE/RLS toggle. No rollback of 0098.
-- Payee FK / RESTRICT remains run 17 (0100).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_migrator') THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "pending_local_psp_dang_migrator"
        ON "finance"."pending_local_psp_payment"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "pending_local_psp_dang_migrator"
      ON "finance"."pending_local_psp_payment"
      FOR ALL
      TO dang_migrator
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
      DROP POLICY IF EXISTS "pending_zarinpal_dang_migrator"
        ON "finance"."pending_zarinpal_payment"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "pending_zarinpal_dang_migrator"
      ON "finance"."pending_zarinpal_payment"
      FOR ALL
      TO dang_migrator
      USING (
        "workspace_id" = "app"."current_workspace_id"()
        OR "authority" = NULLIF(pg_catalog.current_setting('app.zarinpal_authority', true), '')
      )
      WITH CHECK (
        "workspace_id" = "app"."current_workspace_id"()
        OR "authority" = NULLIF(pg_catalog.current_setting('app.zarinpal_authority', true), '')
      )
    $pol$;

    -- Owner already has full table rights; explicit GRANT keeps parity with 0098 runtime grants.
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.pending_local_psp_payment TO dang_migrator';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON finance.pending_zarinpal_payment TO dang_migrator';
  END IF;
END $$;
