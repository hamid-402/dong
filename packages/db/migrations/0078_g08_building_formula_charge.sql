-- G08: building formula splits + subunit area/occupancy

ALTER TABLE "iam"."workspace_subunit"
  ADD COLUMN IF NOT EXISTS "area_sqm" numeric,
  ADD COLUMN IF NOT EXISTS "occupancy" integer;

ALTER TYPE "finance"."split_method" ADD VALUE IF NOT EXISTS 'formula';
