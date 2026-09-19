-- Stage 11 / S11-03: membership provenance, disable metadata, join requests, ownership transfer.

ALTER TABLE "iam"."membership"
  ADD COLUMN IF NOT EXISTS "disabled_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "disabled_reason" text,
  ADD COLUMN IF NOT EXISTS "added_via" text NOT NULL DEFAULT 'invite',
  ADD COLUMN IF NOT EXISTS "added_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'membership_added_via_chk'
      AND conrelid = 'iam.membership'::regclass
  ) THEN
    ALTER TABLE "iam"."membership"
      ADD CONSTRAINT "membership_added_via_chk"
      CHECK ("added_via" IN ('invite', 'friend', 'join_request', 'user_id', 'seed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "iam"."workspace_join_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "message" text,
  "status" text NOT NULL,
  "requested_at" timestamptz DEFAULT now() NOT NULL,
  "decided_at" timestamptz,
  "decided_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  "granted_role" text,
  CONSTRAINT "workspace_join_request_status_chk"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_join_request_pending_uq"
  ON "iam"."workspace_join_request" ("workspace_id", "user_id")
  WHERE ("status" = 'pending');

CREATE INDEX IF NOT EXISTS "workspace_join_request_workspace_idx"
  ON "iam"."workspace_join_request" ("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "workspace_join_request_user_idx"
  ON "iam"."workspace_join_request" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "iam"."workspace_ownership_transfer" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "from_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "to_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "status" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "decided_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "workspace_ownership_transfer_status_chk"
    CHECK ("status" IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  CONSTRAINT "workspace_ownership_transfer_not_self_chk"
    CHECK ("from_user_id" <> "to_user_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_ownership_transfer_pending_uq"
  ON "iam"."workspace_ownership_transfer" ("workspace_id")
  WHERE ("status" = 'pending');

CREATE INDEX IF NOT EXISTS "workspace_ownership_transfer_workspace_idx"
  ON "iam"."workspace_ownership_transfer" ("workspace_id", "status");

ALTER TABLE "iam"."workspace_join_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."workspace_join_request" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_join_request_tenant_select" ON "iam"."workspace_join_request";
CREATE POLICY "workspace_join_request_tenant_select"
ON "iam"."workspace_join_request"
FOR SELECT
USING (
  "workspace_id" = "app"."current_workspace_id"()
  OR "user_id" = "app"."current_user_id"()
);

DROP POLICY IF EXISTS "workspace_join_request_tenant_insert" ON "iam"."workspace_join_request";
CREATE POLICY "workspace_join_request_tenant_insert"
ON "iam"."workspace_join_request"
FOR INSERT
WITH CHECK (
  "workspace_id" = "app"."current_workspace_id"()
  OR "user_id" = "app"."current_user_id"()
);

DROP POLICY IF EXISTS "workspace_join_request_tenant_update" ON "iam"."workspace_join_request";
CREATE POLICY "workspace_join_request_tenant_update"
ON "iam"."workspace_join_request"
FOR UPDATE
USING (
  "workspace_id" = "app"."current_workspace_id"()
  OR "user_id" = "app"."current_user_id"()
)
WITH CHECK (
  "workspace_id" = "app"."current_workspace_id"()
  OR "user_id" = "app"."current_user_id"()
);

ALTER TABLE "iam"."workspace_ownership_transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iam"."workspace_ownership_transfer" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_ownership_transfer_tenant_select" ON "iam"."workspace_ownership_transfer";
CREATE POLICY "workspace_ownership_transfer_tenant_select"
ON "iam"."workspace_ownership_transfer"
FOR SELECT
USING (
  "workspace_id" = "app"."current_workspace_id"()
  OR "from_user_id" = "app"."current_user_id"()
  OR "to_user_id" = "app"."current_user_id"()
);

DROP POLICY IF EXISTS "workspace_ownership_transfer_tenant_insert" ON "iam"."workspace_ownership_transfer";
CREATE POLICY "workspace_ownership_transfer_tenant_insert"
ON "iam"."workspace_ownership_transfer"
FOR INSERT
WITH CHECK ("workspace_id" = "app"."current_workspace_id"());

DROP POLICY IF EXISTS "workspace_ownership_transfer_tenant_update" ON "iam"."workspace_ownership_transfer";
CREATE POLICY "workspace_ownership_transfer_tenant_update"
ON "iam"."workspace_ownership_transfer"
FOR UPDATE
USING (
  "workspace_id" = "app"."current_workspace_id"()
  OR "from_user_id" = "app"."current_user_id"()
  OR "to_user_id" = "app"."current_user_id"()
)
WITH CHECK (
  "workspace_id" = "app"."current_workspace_id"()
  OR "from_user_id" = "app"."current_user_id"()
  OR "to_user_id" = "app"."current_user_id"()
);
