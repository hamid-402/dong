-- Social tables: user-scoped RLS (FORCE). Policies use app.current_user_id().

ALTER TABLE "social"."user_directory_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social"."user_directory_setting" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'social'
      AND tablename = 'user_directory_setting'
      AND policyname = 'user_directory_setting_self'
  ) THEN
    CREATE POLICY "user_directory_setting_self"
      ON "social"."user_directory_setting"
      FOR ALL
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"());
  END IF;
END $$;

ALTER TABLE "social"."friendship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social"."friendship" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'social'
      AND tablename = 'friendship'
      AND policyname = 'friendship_party_all'
  ) THEN
    CREATE POLICY "friendship_party_all"
      ON "social"."friendship"
      FOR ALL
      USING (
        "requester_user_id" = "app"."current_user_id"()
        OR "addressee_user_id" = "app"."current_user_id"()
      )
      WITH CHECK (
        "requester_user_id" = "app"."current_user_id"()
        OR "addressee_user_id" = "app"."current_user_id"()
      );
  END IF;
END $$;

ALTER TABLE "social"."contact_sync_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social"."contact_sync_run" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'social'
      AND tablename = 'contact_sync_run'
      AND policyname = 'contact_sync_run_self'
  ) THEN
    CREATE POLICY "contact_sync_run_self"
      ON "social"."contact_sync_run"
      FOR ALL
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"());
  END IF;
END $$;
