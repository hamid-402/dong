-- Law 10: outbox retry schedule + dead-letter (no infinite redrive).

ALTER TABLE "ops"."outbox_event"
  ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "dead_lettered_at" timestamptz;

CREATE INDEX IF NOT EXISTS "ops_outbox_due_idx"
  ON "ops"."outbox_event" ("created_at")
  WHERE "processed_at" IS NULL AND "dead_lettered_at" IS NULL;

CREATE OR REPLACE FUNCTION ops.outbox_list_pending_for_redrive(p_limit int DEFAULT 50)
RETURNS SETOF ops.outbox_event
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ops, pg_temp
AS $$
  SELECT *
  FROM ops.outbox_event
  WHERE processed_at IS NULL
    AND dead_lettered_at IS NULL
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
  ORDER BY created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE ALL ON FUNCTION ops.outbox_list_pending_for_redrive(int) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION ops.outbox_list_pending_for_redrive(int) TO dang_runtime';
  END IF;
END
$$;

-- Pending gauges exclude dead-lettered rows (still unprocessed, but not redriven).
CREATE OR REPLACE FUNCTION ops.outbox_relay_stats()
RETURNS TABLE (
  pending_count bigint,
  failed_pending_count bigint,
  oldest_pending_age_ms bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ops, pg_temp
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE processed_at IS NULL AND dead_lettered_at IS NULL
    )::bigint AS pending_count,
    COUNT(*) FILTER (
      WHERE processed_at IS NULL
        AND dead_lettered_at IS NULL
        AND (attempts > 0 OR last_error IS NOT NULL)
    )::bigint AS failed_pending_count,
    CASE
      WHEN COUNT(*) FILTER (
        WHERE processed_at IS NULL AND dead_lettered_at IS NULL
      ) = 0 THEN NULL
      ELSE (
        EXTRACT(
          EPOCH FROM (
            now() - MIN(created_at) FILTER (
              WHERE processed_at IS NULL AND dead_lettered_at IS NULL
            )
          )
        ) * 1000
      )::bigint
    END AS oldest_pending_age_ms
  FROM ops.outbox_event;
$$;

REVOKE ALL ON FUNCTION ops.outbox_relay_stats() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION ops.outbox_relay_stats() TO dang_runtime';
  END IF;
END
$$;
