CREATE TABLE IF NOT EXISTS "partnership"."period_lock" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "reason" text,
  "locked_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "locked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership"."period_lock"
  ADD CONSTRAINT "period_lock_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "period_lock_idempotency_uq"
  ON "partnership"."period_lock" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
ALTER TABLE "partnership"."period_lock" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partnership"."period_lock" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "period_lock_tenant_all"
ON "partnership"."period_lock"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
