ALTER TABLE "collab"."attachment"
  ADD COLUMN IF NOT EXISTS "storage_path" text;
