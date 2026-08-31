CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "iam";
--> statement-breakpoint
CREATE TYPE "iam"."membership_role" AS ENUM('owner', 'admin', 'finance', 'approver', 'buyer', 'asset_custodian', 'member', 'auditor');--> statement-breakpoint
CREATE TYPE "iam"."workspace_template" AS ENUM('friends_family', 'project_partners', 'small_team', 'construction');--> statement-breakpoint
CREATE TABLE "audit"."event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"result" text NOT NULL,
	"reason" text,
	"request_id" text,
	"trace_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam"."membership" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "iam"."membership_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "membership_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "iam"."user_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_subject" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iam"."workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"template" "iam"."workspace_template" NOT NULL,
	"timezone" text DEFAULT 'Asia/Tehran' NOT NULL,
	"display_unit" text DEFAULT 'toman' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit"."event" ADD CONSTRAINT "event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."event" ADD CONSTRAINT "event_actor_user_id_user_account_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "iam"."user_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "iam"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."membership" ADD CONSTRAINT "membership_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."workspace" ADD CONSTRAINT "workspace_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."user_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_workspace_time_idx" ON "audit"."event" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_target_idx" ON "audit"."event" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "membership_user_id_idx" ON "iam"."membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_account_external_subject_uq" ON "iam"."user_account" USING btree ("external_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_uq" ON "iam"."workspace" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "workspace_created_by_idx" ON "iam"."workspace" USING btree ("created_by");