-- G04: guest placeholders, outing event budget, split presets

CREATE TABLE IF NOT EXISTS "iam"."guest_placeholder" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "display_name" text NOT NULL,
  "phone_e164" text,
  "claim_token_hash" text NOT NULL,
  "claimed_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  "claimed_at" timestamptz,
  "created_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "idempotency_key" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "guest_placeholder_idempotency_uq"
  ON "iam"."guest_placeholder" ("workspace_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "guest_placeholder_workspace_idx"
  ON "iam"."guest_placeholder" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "guest_placeholder_claim_token_uq"
  ON "iam"."guest_placeholder" ("claim_token_hash");

ALTER TABLE "finance"."outing"
  ADD COLUMN IF NOT EXISTS "budget_cap_minor" bigint,
  ADD COLUMN IF NOT EXISTS "starts_on" date,
  ADD COLUMN IF NOT EXISTS "ends_on" date;

CREATE TABLE IF NOT EXISTS "finance"."workspace_split_preset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "split_method" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "idempotency_key" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_split_preset_idempotency_uq"
  ON "finance"."workspace_split_preset" ("workspace_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "workspace_split_preset_workspace_idx"
  ON "finance"."workspace_split_preset" ("workspace_id");

CREATE TABLE IF NOT EXISTS "finance"."workspace_split_preset_line" (
  "preset_id" uuid NOT NULL REFERENCES "finance"."workspace_split_preset"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "shares" integer,
  "percent_bp" integer,
  "amount_minor" bigint,
  PRIMARY KEY ("preset_id", "user_id")
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON iam.guest_placeholder TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.workspace_split_preset TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON finance.workspace_split_preset_line TO dang_runtime';
  END IF;
END
$$;

ALTER TABLE "iam"."guest_placeholder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."workspace_split_preset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."workspace_split_preset_line" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'iam' AND tablename = 'guest_placeholder' AND policyname = 'guest_placeholder_tenant'
  ) THEN
    CREATE POLICY guest_placeholder_tenant ON "iam"."guest_placeholder"
      USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'finance' AND tablename = 'workspace_split_preset' AND policyname = 'split_preset_tenant'
  ) THEN
    CREATE POLICY split_preset_tenant ON "finance"."workspace_split_preset"
      USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
      WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'finance' AND tablename = 'workspace_split_preset_line' AND policyname = 'split_preset_line_tenant'
  ) THEN
    CREATE POLICY split_preset_line_tenant ON "finance"."workspace_split_preset_line"
      USING (
        EXISTS (
          SELECT 1 FROM finance.workspace_split_preset p
          WHERE p.id = preset_id
            AND p.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM finance.workspace_split_preset p
          WHERE p.id = preset_id
            AND p.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        )
      );
  END IF;
END
$$;
