CREATE SCHEMA IF NOT EXISTS "accounting";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "accounting"."journal_source_type" AS ENUM('expense', 'settlement');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "accounting"."journal_entry_status" AS ENUM('posted', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "accounting"."journal_line_side" AS ENUM('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting"."journal_entry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source_type" "accounting"."journal_source_type" NOT NULL,
  "source_id" uuid NOT NULL,
  "status" "accounting"."journal_entry_status" DEFAULT 'posted' NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "idempotency_key" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting"."journal_entry"
  ADD CONSTRAINT "journal_entry_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounting"."journal_entry"
  ADD CONSTRAINT "journal_entry_actor_user_id_user_account_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entry_source_uq"
  ON "accounting"."journal_entry" USING btree ("workspace_id", "source_type", "source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entry_idempotency_uq"
  ON "accounting"."journal_entry" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_workspace_time_idx"
  ON "accounting"."journal_entry" USING btree ("workspace_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting"."journal_line" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "account_code" text NOT NULL,
  "user_id" uuid NOT NULL,
  "side" "accounting"."journal_line_side" NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text DEFAULT 'IRR' NOT NULL,
  "line_no" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting"."journal_line"
  ADD CONSTRAINT "journal_line_entry_id_journal_entry_id_fk"
  FOREIGN KEY ("entry_id") REFERENCES "accounting"."journal_entry"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounting"."journal_line"
  ADD CONSTRAINT "journal_line_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounting"."journal_line"
  ADD CONSTRAINT "journal_line_user_id_user_account_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_line_entry_idx"
  ON "accounting"."journal_line" USING btree ("entry_id", "line_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_line_workspace_user_idx"
  ON "accounting"."journal_line" USING btree ("workspace_id", "user_id");
--> statement-breakpoint
ALTER TABLE "accounting"."journal_entry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounting"."journal_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "journal_entry_tenant_select"
ON "accounting"."journal_entry"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "journal_entry_tenant_insert"
ON "accounting"."journal_entry"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "accounting"."journal_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounting"."journal_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "journal_line_tenant_select"
ON "accounting"."journal_line"
FOR SELECT
USING ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
CREATE POLICY "journal_line_tenant_insert"
ON "accounting"."journal_line"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "accounting"."journal_entry" FROM PUBLIC;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "accounting"."journal_line" FROM PUBLIC;
