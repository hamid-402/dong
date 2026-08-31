CREATE SCHEMA IF NOT EXISTS "collab";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collab"."comment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "author_user_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collab"."comment"
  ADD CONSTRAINT "comment_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "collab"."comment"
  ADD CONSTRAINT "comment_author_user_id_user_account_id_fk"
  FOREIGN KEY ("author_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_target_idx"
  ON "collab"."comment" USING btree ("workspace_id", "target_type", "target_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collab"."attachment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "content_hash" text NOT NULL,
  "uploaded_by_user_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "ocr_job_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collab"."attachment"
  ADD CONSTRAINT "attachment_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attachment_idempotency_uq"
  ON "collab"."attachment" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collab"."notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collab"."notification"
  ADD CONSTRAINT "notification_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_idx"
  ON "collab"."notification" USING btree ("workspace_id", "user_id", "created_at");
--> statement-breakpoint
ALTER TABLE "collab"."comment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "collab"."comment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "comment_tenant_all"
ON "collab"."comment"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "collab"."attachment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "collab"."attachment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "attachment_tenant_all"
ON "collab"."attachment"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "collab"."notification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "collab"."notification" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notification_tenant_all"
ON "collab"."notification"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
