-- Billing DELETE policies + runtime grants for period invoices (regen path)

DO $$ BEGIN
  CREATE POLICY "expense_period_tenant_delete"
  ON "finance"."expense_period" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "member_invoice_tenant_delete"
  ON "finance"."member_invoice" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE POLICY "member_invoice_line_tenant_delete"
  ON "finance"."member_invoice_line" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_period TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.member_invoice TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.member_invoice_line TO dang_runtime';
  END IF;
END $$;
