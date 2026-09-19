-- Stage 10 / R10-06 depth: local key vault ciphertext (ops.vault_secret).
-- Master key stays outside the DB (DANG_MASTER_KEY / .dang/master.key).

CREATE SCHEMA IF NOT EXISTS "ops";

CREATE TABLE IF NOT EXISTS "ops"."vault_secret" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "version" integer NOT NULL,
  "ciphertext" text NOT NULL,
  "wrapped_dek" text NOT NULL,
  "master_key_version" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "vault_secret_version_positive" CHECK ("version" > 0),
  CONSTRAINT "vault_secret_mk_positive" CHECK ("master_key_version" > 0),
  CONSTRAINT "vault_secret_name_version_uidx" UNIQUE ("name", "version")
);

CREATE INDEX IF NOT EXISTS "vault_secret_name_idx"
  ON "ops"."vault_secret" ("name", "version" DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ops TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ops.vault_secret TO dang_runtime';
  END IF;
END
$$;
