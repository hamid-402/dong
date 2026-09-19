-- Additive: tenant RLS for workspace_payout_profile + statement_export retention.
--> statement-breakpoint

ALTER TABLE "finance"."workspace_payout_profile" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."workspace_payout_profile" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_payout_profile_tenant_all" ON "finance"."workspace_payout_profile";
--> statement-breakpoint
CREATE POLICY "workspace_payout_profile_tenant_all" ON "finance"."workspace_payout_profile" FOR ALL
  USING ("workspace_id" = "app"."current_workspace_id"())
  WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint

ALTER TABLE "finance"."statement_export"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "statement_export_expires_at_idx"
  ON "finance"."statement_export" USING btree ("expires_at")
  WHERE "expires_at" IS NOT NULL;
