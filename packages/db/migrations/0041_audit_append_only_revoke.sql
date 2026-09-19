-- Ensure audit.event stays append-only for runtime (idempotent).
REVOKE UPDATE, DELETE ON "audit"."event" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit.event FROM dang_runtime';
  END IF;
END
$$;
