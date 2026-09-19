-- G07: saved cross-workspace report views (user-scoped).

CREATE TABLE IF NOT EXISTS "iam"."user_report_view" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "months" integer NOT NULL,
  "sort_key" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_report_view_user_idx"
  ON "iam"."user_report_view" ("user_id", "updated_at" DESC);

ALTER TABLE "iam"."user_report_view" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."user_report_view" FORCE ROW LEVEL SECURITY;

CREATE POLICY "iam_user_report_view_self_select"
ON "iam"."user_report_view"
FOR SELECT
USING ("user_id"::text = current_setting('app.user_id', true));

CREATE POLICY "iam_user_report_view_self_insert"
ON "iam"."user_report_view"
FOR INSERT
WITH CHECK ("user_id"::text = current_setting('app.user_id', true));

CREATE POLICY "iam_user_report_view_self_update"
ON "iam"."user_report_view"
FOR UPDATE
USING ("user_id"::text = current_setting('app.user_id', true))
WITH CHECK ("user_id"::text = current_setting('app.user_id', true));

CREATE POLICY "iam_user_report_view_self_delete"
ON "iam"."user_report_view"
FOR DELETE
USING ("user_id"::text = current_setting('app.user_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.user_report_view TO dang_runtime';
  END IF;
END
$$;
