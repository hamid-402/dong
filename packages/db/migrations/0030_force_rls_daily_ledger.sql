-- Force RLS on daily-ledger tables so table owners cannot bypass tenant isolation.
ALTER TABLE finance.workspace_day FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE finance.workspace_range_lock FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_day_tenant_all" ON finance.workspace_day;
--> statement-breakpoint
CREATE POLICY "workspace_day_tenant_all"
  ON finance.workspace_day
  FOR ALL
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());
--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_range_lock_tenant_all" ON finance.workspace_range_lock;
--> statement-breakpoint
CREATE POLICY "workspace_range_lock_tenant_all"
  ON finance.workspace_range_lock
  FOR ALL
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());
