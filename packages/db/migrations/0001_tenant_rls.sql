CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."current_workspace_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.workspace_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."current_user_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
ALTER TABLE "iam"."workspace" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam"."workspace" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_tenant_select"
ON "iam"."workspace"
FOR SELECT
USING ("id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "workspace_tenant_insert"
ON "iam"."workspace"
FOR INSERT
WITH CHECK ("id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "workspace_tenant_update"
ON "iam"."workspace"
FOR UPDATE
USING ("id" = "app"."current_workspace_id"())
WITH CHECK ("id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "iam"."membership" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam"."membership" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "membership_tenant_select"
ON "iam"."membership"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "membership_tenant_insert"
ON "iam"."membership"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "membership_tenant_update"
ON "iam"."membership"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "membership_tenant_delete"
ON "iam"."membership"
FOR DELETE
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "audit"."event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit"."event" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_event_tenant_select"
ON "audit"."event"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "audit_event_tenant_insert"
ON "audit"."event"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "audit"."event" FROM PUBLIC;