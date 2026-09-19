-- Stage 11 / S11-05: default display unit for NEW workspaces is rial.
-- Existing rows keep their current value (usually toman).

ALTER TABLE "iam"."workspace"
  ALTER COLUMN "display_unit" SET DEFAULT 'rial';
