-- Public directory flags for cross-user reads under FORCE RLS (اجرای ۶).
-- Does not loosen user_directory_setting policies; only exposes two booleans.

CREATE OR REPLACE FUNCTION "social"."directory_public_settings"("p_user_id" uuid)
RETURNS TABLE (
  "findable_by_username" boolean,
  "allow_friend_requests" boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  prev_user_id text;
BEGIN
  prev_user_id := pg_catalog.current_setting('app.user_id', true);
  PERFORM pg_catalog.set_config('app.user_id', COALESCE(p_user_id::text, ''), true);

  RETURN QUERY
  SELECT
    COALESCE(s.findable_by_username, true),
    COALESCE(s.allow_friend_requests, true)
  FROM (SELECT 1) AS _
  LEFT JOIN "social"."user_directory_setting" AS s
    ON s.user_id = p_user_id;

  PERFORM pg_catalog.set_config('app.user_id', COALESCE(prev_user_id, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION "social"."directory_public_settings"(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION "social"."directory_public_settings"(uuid) TO dang_runtime';
  END IF;
END
$$;
