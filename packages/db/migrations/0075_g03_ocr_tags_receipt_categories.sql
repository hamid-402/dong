-- G03: OCR persist on attachment, receipt-by-category policy, expense tags M2M

ALTER TABLE "collab"."attachment"
  ADD COLUMN IF NOT EXISTS "ocr_result" jsonb;

ALTER TABLE "finance"."workspace_expense_policy"
  ADD COLUMN IF NOT EXISTS "require_receipt_category_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "finance"."expense_tag" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "color" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "expense_tag_workspace_slug_uq"
  ON "finance"."expense_tag" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "expense_tag_workspace_idx"
  ON "finance"."expense_tag" ("workspace_id");

CREATE TABLE IF NOT EXISTS "finance"."expense_tag_link" (
  "expense_id" uuid NOT NULL REFERENCES "finance"."expense"("id") ON DELETE cascade,
  "tag_id" uuid NOT NULL REFERENCES "finance"."expense_tag"("id") ON DELETE cascade,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  PRIMARY KEY ("expense_id", "tag_id")
);

CREATE INDEX IF NOT EXISTS "expense_tag_link_tag_idx"
  ON "finance"."expense_tag_link" ("workspace_id", "tag_id");
CREATE INDEX IF NOT EXISTS "expense_tag_link_expense_idx"
  ON "finance"."expense_tag_link" ("workspace_id", "expense_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_tag TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.expense_tag_link TO dang_runtime';
  END IF;
END
$$;

ALTER TABLE "finance"."expense_tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."expense_tag_link" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'finance' AND tablename = 'expense_tag' AND policyname = 'expense_tag_tenant'
  ) THEN
    CREATE POLICY expense_tag_tenant ON "finance"."expense_tag"
      USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'finance' AND tablename = 'expense_tag_link' AND policyname = 'expense_tag_link_tenant'
  ) THEN
    CREATE POLICY expense_tag_link_tenant ON "finance"."expense_tag_link"
      USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
  END IF;
END
$$;
