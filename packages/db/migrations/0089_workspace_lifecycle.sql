-- Soft archive / soft-delete for workspaces (ledger preserved).

ALTER TABLE "iam"."workspace"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "archived_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deleted_by_user_id" uuid;

DO $$ BEGIN
  ALTER TABLE "iam"."workspace"
    ADD CONSTRAINT "workspace_archived_by_fk"
    FOREIGN KEY ("archived_by_user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "iam"."workspace"
    ADD CONSTRAINT "workspace_deleted_by_fk"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "iam"."user_account"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "workspace_archived_at_idx"
  ON "iam"."workspace" ("archived_at")
  WHERE "archived_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "workspace_deleted_at_idx"
  ON "iam"."workspace" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
