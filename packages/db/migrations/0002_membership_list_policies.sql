-- Improve membership/workspace SELECT so a user can list their own memberships
-- without already knowing the target workspace id. INSERT/UPDATE remain
-- workspace-scoped via app.current_workspace_id().

DROP POLICY IF EXISTS "membership_tenant_select" ON "iam"."membership";
CREATE POLICY "membership_tenant_select"
ON "iam"."membership"
FOR SELECT
USING (
  "workspace_id" = "app"."current_workspace_id"()
  OR "user_id" = "app"."current_user_id"()
);

DROP POLICY IF EXISTS "workspace_tenant_select" ON "iam"."workspace";
CREATE POLICY "workspace_tenant_select"
ON "iam"."workspace"
FOR SELECT
USING (
  "id" = "app"."current_workspace_id"()
  OR EXISTS (
    SELECT 1
    FROM "iam"."membership" AS m
    WHERE m."workspace_id" = "iam"."workspace"."id"
      AND m."user_id" = "app"."current_user_id"()
      AND m."disabled_at" IS NULL
  )
);
