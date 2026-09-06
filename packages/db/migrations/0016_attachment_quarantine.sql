ALTER TABLE "collab"."attachment"
  ADD COLUMN IF NOT EXISTS "quarantine_status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON collab.attachment TO dang_runtime';
  END IF;
END $$;
