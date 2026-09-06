-- Day-level meta for group daily consumption ledger (notes + manual holiday).
CREATE TABLE IF NOT EXISTS "finance"."workspace_day" (
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE CASCADE,
  "day_on" date NOT NULL,
  "is_holiday" boolean NOT NULL DEFAULT false,
  "note" text,
  "updated_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_day_pk" PRIMARY KEY ("workspace_id", "day_on")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_day_workspace_range_idx"
  ON "finance"."workspace_day" ("workspace_id", "day_on");
--> statement-breakpoint
ALTER TABLE "finance"."workspace_day" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_day_tenant_all" ON "finance"."workspace_day";
--> statement-breakpoint
CREATE POLICY "workspace_day_tenant_all"
  ON "finance"."workspace_day"
  FOR ALL
  USING (
    "workspace_id"::text = current_setting('app.workspace_id', true)
  )
  WITH CHECK (
    "workspace_id"::text = current_setting('app.workspace_id', true)
  );
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.workspace_day TO dang_runtime';
  END IF;
END $$;
