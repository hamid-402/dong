-- Residential building template + workspace subunits (units / departments).

ALTER TYPE "iam"."workspace_template" ADD VALUE IF NOT EXISTS 'residential_building';

CREATE TABLE IF NOT EXISTS "iam"."workspace_subunit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "note" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_subunit_code_uq"
  ON "iam"."workspace_subunit" ("workspace_id", "code");
CREATE INDEX IF NOT EXISTS "workspace_subunit_ws_idx"
  ON "iam"."workspace_subunit" ("workspace_id", "sort_order");

CREATE TABLE IF NOT EXISTS "iam"."workspace_subunit_member" (
  "subunit_id" uuid NOT NULL REFERENCES "iam"."workspace_subunit"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "assigned_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("subunit_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "workspace_subunit_member_user_idx"
  ON "iam"."workspace_subunit_member" ("user_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.workspace_subunit TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.workspace_subunit_member TO dang_runtime';
  END IF;
END
$$;

ALTER TABLE "iam"."workspace_subunit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."workspace_subunit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_subunit_tenant_all" ON "iam"."workspace_subunit";
CREATE POLICY "workspace_subunit_tenant_all"
  ON "iam"."workspace_subunit" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

ALTER TABLE "iam"."workspace_subunit_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."workspace_subunit_member" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_subunit_member_tenant_all" ON "iam"."workspace_subunit_member";
CREATE POLICY "workspace_subunit_member_tenant_all"
  ON "iam"."workspace_subunit_member" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "iam"."workspace_subunit" s
      WHERE s.id = "subunit_id"
        AND s.workspace_id = "app"."current_workspace_id"()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "iam"."workspace_subunit" s
      WHERE s.id = "subunit_id"
        AND s.workspace_id = "app"."current_workspace_id"()
    )
  );
