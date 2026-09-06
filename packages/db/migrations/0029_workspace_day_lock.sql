-- Holiday reverse audit ids + range locks for daily ledger month close.
ALTER TABLE finance.workspace_day
  ADD COLUMN IF NOT EXISTS holiday_reversed_expense_ids uuid[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance"."workspace_range_lock" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE CASCADE,
  "range_start" date NOT NULL,
  "range_end" date NOT NULL,
  "reason" text,
  "idempotency_key" text NOT NULL,
  "locked_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "locked_at" timestamptz NOT NULL DEFAULT now(),
  "unlocked_by_user_id" uuid REFERENCES "iam"."user_account"("id"),
  "unlocked_at" timestamptz,
  CONSTRAINT "workspace_range_lock_range_chk" CHECK ("range_start" <= "range_end")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_range_lock_idem_uq"
  ON "finance"."workspace_range_lock" ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_range_lock_workspace_idx"
  ON "finance"."workspace_range_lock" ("workspace_id", "range_start", "range_end");
--> statement-breakpoint
ALTER TABLE "finance"."workspace_range_lock" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_range_lock_tenant_all" ON "finance"."workspace_range_lock";
--> statement-breakpoint
CREATE POLICY "workspace_range_lock_tenant_all"
  ON "finance"."workspace_range_lock"
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
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.workspace_range_lock TO dang_runtime';
  END IF;
END $$;
