-- Canonical personal workspace: one row per user (oldest existing personal membership wins).
CREATE TABLE IF NOT EXISTS "iam"."personal_workspace" (
  "user_id" uuid PRIMARY KEY REFERENCES "iam"."user_account"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personal_workspace_workspace_uq"
  ON "iam"."personal_workspace" ("workspace_id");
--> statement-breakpoint
INSERT INTO "iam"."personal_workspace" ("user_id", "workspace_id")
SELECT DISTINCT ON (m."user_id") m."user_id", w."id"
FROM "iam"."membership" m
INNER JOIN "iam"."workspace" w ON w."id" = m."workspace_id"
WHERE w."template" = 'personal'
  AND m."disabled_at" IS NULL
ORDER BY m."user_id", w."created_at" ASC
ON CONFLICT ("user_id") DO NOTHING;
