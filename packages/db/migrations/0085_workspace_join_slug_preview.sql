-- Public join preview: SELECT the one workspace whose slug matches transaction-local
-- GUC app.join_slug (set only by getWorkspaceBySlug). FORCE RLS previously hid every
-- row when workspace_id was unset, so join-by-slug always 404'd.

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
  OR (
    NULLIF(pg_catalog.current_setting('app.join_slug', true), '') IS NOT NULL
    AND "slug" = NULLIF(pg_catalog.current_setting('app.join_slug', true), '')
  )
);
