-- CI / local bootstrap: runtime role must NOT bypass RLS.
-- Run as migrator/superuser AFTER drizzle migrations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    CREATE ROLE dang_runtime
      LOGIN
      PASSWORD 'dang_runtime_ci'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE dang_test TO dang_runtime;

GRANT USAGE ON SCHEMA
  iam, audit, app, accounting, finance, collab, procurement, asset, partnership, personal, proposals, ops
TO dang_runtime;

-- Broad DML for app tables; revokes below restore ledger/audit immutability.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA audit TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA accounting TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA collab TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA procurement TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA asset TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA partnership TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA personal TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA proposals TO dang_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ops TO dang_runtime;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA iam TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA accounting TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA finance TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA collab TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA procurement TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA asset TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA partnership TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA personal TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA proposals TO dang_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ops TO dang_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA iam GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA accounting GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA collab GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA personal GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA proposals GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA ops GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dang_runtime;

REVOKE UPDATE, DELETE ON audit.event FROM dang_runtime;
REVOKE UPDATE, DELETE ON accounting.journal_entry, accounting.journal_line FROM dang_runtime;

-- NOLOGIN probe for tests that must SET ROLE dang_runtime.
-- INHERIT FALSE: membership does not add runtime DML to the grantee.
-- Connections without CREATEROLE (local dang_migrator) skip creation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_rls_probe')
     AND EXISTS (
       SELECT 1
       FROM pg_roles
       WHERE rolname = current_user
         AND (rolsuper OR rolcreaterole)
     )
  THEN
    CREATE ROLE dang_rls_probe
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_rls_probe')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime')
     AND EXISTS (
       SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper
     )
  THEN
    EXECUTE 'GRANT dang_runtime TO dang_rls_probe WITH INHERIT FALSE, SET TRUE';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_rls_probe')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_migrator')
     AND EXISTS (
       SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper
     )
  THEN
    EXECUTE 'GRANT dang_rls_probe TO dang_migrator WITH INHERIT FALSE, SET TRUE';
    EXECUTE 'GRANT dang_runtime TO dang_migrator WITH INHERIT FALSE, SET TRUE';
  END IF;
END
$$;
