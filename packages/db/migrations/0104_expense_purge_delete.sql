-- Additive: hard-delete of a draft or reversed expense (API purge).
-- dang_runtime had SELECT/INSERT/UPDATE on finance.expense but not DELETE,
-- and FORCE RLS had no DELETE policy, so DELETE returned 42501.
-- Posted rows stay blocked in the application. No DROP, no FORCE change, no new role.
-- Split and payment lines cascade from expense and need the same DELETE right.

--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "expense_tenant_delete"
  ON "finance"."expense" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "expense_split_tenant_delete"
  ON "finance"."expense_split_line" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE POLICY "expense_payment_tenant_delete"
  ON "finance"."expense_payment_line" FOR DELETE
  USING ("workspace_id" = "app"."current_workspace_id"());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT DELETE ON finance.expense TO dang_runtime';
    EXECUTE 'GRANT DELETE ON finance.expense_split_line TO dang_runtime';
    EXECUTE 'GRANT DELETE ON finance.expense_payment_line TO dang_runtime';
  END IF;
END $$;
