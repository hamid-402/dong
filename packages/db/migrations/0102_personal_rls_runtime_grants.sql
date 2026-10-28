-- Additive: RLS + FORCE + dual-role owner policies + minimal dang_runtime grants
-- for personal.money_intent / allocation_plan / paycheck.
-- Catalog / drizzle / append-only tables are out of scope (0103+).
-- Lesson 0098/0099: FORCE without dang_migrator policy breaks prod still on migrator.

--> statement-breakpoint
ALTER TABLE "personal"."money_intent" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."money_intent" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."allocation_plan" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."allocation_plan" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."paycheck" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personal"."paycheck" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "money_intent_owner_dang_runtime"
        ON "personal"."money_intent"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "money_intent_owner_dang_runtime"
      ON "personal"."money_intent"
      FOR ALL
      TO dang_runtime
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"())
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "allocation_plan_owner_dang_runtime"
        ON "personal"."allocation_plan"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "allocation_plan_owner_dang_runtime"
      ON "personal"."allocation_plan"
      FOR ALL
      TO dang_runtime
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"())
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "paycheck_owner_dang_runtime"
        ON "personal"."paycheck"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "paycheck_owner_dang_runtime"
      ON "personal"."paycheck"
      FOR ALL
      TO dang_runtime
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"())
    $pol$;

    EXECUTE 'GRANT USAGE ON SCHEMA personal TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON personal.money_intent TO dang_runtime';
    EXECUTE $g$
      GRANT UPDATE (
        name, period, target_minor, target_percent, goal_id, active, updated_at
      ) ON personal.money_intent TO dang_runtime
    $g$;
    EXECUTE 'GRANT SELECT, INSERT ON personal.allocation_plan TO dang_runtime';
    EXECUTE $g$
      GRANT UPDATE (
        solo_percent, group_percent, building_percent, org_percent,
        savings_percent, updated_at
      ) ON personal.allocation_plan TO dang_runtime
    $g$;
    EXECUTE 'GRANT SELECT, INSERT ON personal.paycheck TO dang_runtime';
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_migrator') THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "money_intent_owner_dang_migrator"
        ON "personal"."money_intent"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "money_intent_owner_dang_migrator"
      ON "personal"."money_intent"
      FOR ALL
      TO dang_migrator
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"())
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "allocation_plan_owner_dang_migrator"
        ON "personal"."allocation_plan"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "allocation_plan_owner_dang_migrator"
      ON "personal"."allocation_plan"
      FOR ALL
      TO dang_migrator
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"())
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "paycheck_owner_dang_migrator"
        ON "personal"."paycheck"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "paycheck_owner_dang_migrator"
      ON "personal"."paycheck"
      FOR ALL
      TO dang_migrator
      USING ("user_id" = "app"."current_user_id"())
      WITH CHECK ("user_id" = "app"."current_user_id"())
    $pol$;
  END IF;
END $$;
