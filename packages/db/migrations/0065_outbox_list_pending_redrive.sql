-- W6 ops: platform redrive over pending outbox without per-tenant GUC.

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
