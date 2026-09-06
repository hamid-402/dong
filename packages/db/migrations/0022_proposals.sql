CREATE SCHEMA IF NOT EXISTS "proposals";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "proposals"."proposal_kind" AS ENUM('goods', 'service');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "proposals"."proposal_status" AS ENUM('open', 'accepted', 'rejected', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "proposals"."vote_choice" AS ENUM('yes', 'no');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals"."workspace_proposal_settings" (
  "workspace_id" uuid PRIMARY KEY NOT NULL,
  "quorum_percent" integer DEFAULT 51 NOT NULL,
  "updated_by_user_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals"."workspace_proposal_settings"
  ADD CONSTRAINT "proposal_settings_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposals"."workspace_proposal_settings"
  ADD CONSTRAINT "proposal_settings_quorum_chk"
  CHECK ("quorum_percent" >= 1 AND "quorum_percent" <= 100);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals"."proposal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" "proposals"."proposal_kind" NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "estimated_amount_minor" bigint,
  "currency" text DEFAULT 'IRR',
  "status" "proposals"."proposal_status" DEFAULT 'open' NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "accepted_need_id" uuid,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals"."proposal"
  ADD CONSTRAINT "proposal_workspace_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposals"."proposal"
  ADD CONSTRAINT "proposal_created_by_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposals"."proposal"
  ADD CONSTRAINT "proposal_accepted_need_fk"
  FOREIGN KEY ("accepted_need_id") REFERENCES "procurement"."need"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "proposal_idempotency_uq"
  ON "proposals"."proposal" USING btree ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_workspace_status_idx"
  ON "proposals"."proposal" USING btree ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals"."proposal_vote" (
  "proposal_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "choice" "proposals"."vote_choice" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("proposal_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "proposals"."proposal_vote"
  ADD CONSTRAINT "proposal_vote_proposal_fk"
  FOREIGN KEY ("proposal_id") REFERENCES "proposals"."proposal"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposals"."proposal_vote"
  ADD CONSTRAINT "proposal_vote_user_fk"
  FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proposals"."workspace_proposal_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "proposals"."workspace_proposal_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "proposal_settings_tenant_all"
ON "proposals"."workspace_proposal_settings"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "proposals"."proposal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "proposals"."proposal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "proposal_tenant_all"
ON "proposals"."proposal"
FOR ALL
USING ("workspace_id" = "app"."current_workspace_id"())
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());
--> statement-breakpoint
ALTER TABLE "proposals"."proposal_vote" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "proposals"."proposal_vote" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "proposal_vote_tenant_all"
ON "proposals"."proposal_vote"
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM "proposals"."proposal" p
    WHERE p."id" = "proposal_id"
      AND p."workspace_id" = "app"."current_workspace_id"()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "proposals"."proposal" p
    WHERE p."id" = "proposal_id"
      AND p."workspace_id" = "app"."current_workspace_id"()
  )
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA proposals TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON proposals.workspace_proposal_settings TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON proposals.proposal TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON proposals.proposal_vote TO dang_runtime';
  END IF;
END $$;
