-- Pinned workspaces for directory switcher (cross-device sync).
-- Ordered jsonb string array; empty = no pins. Cap enforced in API (≤8).

ALTER TABLE "iam"."user_ui_pref"
  ADD COLUMN IF NOT EXISTS "pinned_workspace_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON iam.user_ui_pref TO dang_runtime';
  END IF;
END
$$;
