-- S11-08: statement_export + optional item-level columns on member_invoice_line
--> statement-breakpoint

ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "expense_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "catalog_item_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "item_name_snapshot" text;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "unit_code" text;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "quantity" numeric(18, 6);
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "unit_price_minor" bigint;
--> statement-breakpoint
ALTER TABLE "finance"."member_invoice_line"
  ADD COLUMN IF NOT EXISTS "share_ratio" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "finance"."statement_export" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "subject_user_id" uuid NOT NULL,
  "from_on" date NOT NULL,
  "to_on" date NOT NULL,
  "format" text NOT NULL,
  "status" text NOT NULL,
  "row_count" integer DEFAULT 0 NOT NULL,
  "body" text,
  "mime_type" text,
  "file_name" text,
  "requested_by_user_id" uuid NOT NULL,
  "error_detail" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "finance"."statement_export"
  ADD CONSTRAINT "statement_export_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "finance"."statement_export"
  ADD CONSTRAINT "statement_export_subject_fk"
  FOREIGN KEY ("subject_user_id") REFERENCES "iam"."user_account"("id");
--> statement-breakpoint
ALTER TABLE "finance"."statement_export"
  ADD CONSTRAINT "statement_export_requested_by_fk"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "iam"."user_account"("id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "statement_export_workspace_created_idx"
  ON "finance"."statement_export" USING btree ("workspace_id", "created_at");
--> statement-breakpoint

ALTER TABLE "finance"."statement_export" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."statement_export" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "statement_export_tenant_all" ON "finance"."statement_export";
--> statement-breakpoint
CREATE POLICY "statement_export_tenant_all" ON "finance"."statement_export" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.statement_export TO dang_runtime';
  END IF;
END $$;
