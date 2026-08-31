CREATE TABLE IF NOT EXISTS "iam"."invite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "role" "iam"."membership_role" NOT NULL,
  "invited_subject" text,
  "invited_by_user_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iam"."invite"
  ADD CONSTRAINT "invite_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "iam"."invite"
  ADD CONSTRAINT "invite_invited_by_user_id_user_account_id_fk"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "iam"."invite"
  ADD CONSTRAINT "invite_accepted_by_user_id_user_account_id_fk"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invite_token_hash_uq" ON "iam"."invite" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_workspace_id_idx" ON "iam"."invite" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "iam"."invite" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam"."invite" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invite_tenant_select"
ON "iam"."invite"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "invite_tenant_insert"
ON "iam"."invite"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "invite_tenant_update"
ON "iam"."invite"
FOR UPDATE
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
