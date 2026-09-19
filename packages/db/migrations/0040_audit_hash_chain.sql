-- Stage 10 B2 / R10-04: hash-chain columns on audit.event (additive; old rows stay NULL).

ALTER TABLE "audit"."event"
  ADD COLUMN IF NOT EXISTS "event_hash" text,
  ADD COLUMN IF NOT EXISTS "prev_hash" text;

CREATE INDEX IF NOT EXISTS "audit_event_workspace_hash_idx"
  ON "audit"."event" ("workspace_id", "occurred_at" DESC, "id" DESC);

COMMENT ON COLUMN "audit"."event"."event_hash" IS 'SHA-256 hex of canonical audit payload + prev_hash (R10-04)';
COMMENT ON COLUMN "audit"."event"."prev_hash" IS 'Previous event_hash in workspace chain; NULL = genesis';

-- Re-assert append-only privileges (idempotent).
REVOKE UPDATE, DELETE ON "audit"."event" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit.event FROM dang_runtime';
  END IF;
END
$$;
