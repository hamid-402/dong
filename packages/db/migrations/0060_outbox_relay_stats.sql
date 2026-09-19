-- R10-01: aggregate outbox relay stats for platform SLO (no row leakage).

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
    COUNT(*) FILTER (WHERE processed_at IS NULL)::bigint AS pending_count,
    COUNT(*) FILTER (
      WHERE processed_at IS NULL AND (attempts > 0 OR last_error IS NOT NULL)
    )::bigint AS failed_pending_count,
    CASE
      WHEN COUNT(*) FILTER (WHERE processed_at IS NULL) = 0 THEN NULL
      ELSE (
        EXTRACT(
          EPOCH FROM (
            now() - MIN(created_at) FILTER (WHERE processed_at IS NULL)
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
