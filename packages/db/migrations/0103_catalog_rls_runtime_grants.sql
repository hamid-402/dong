-- Additive: ENABLE+FORCE RLS + dual-role policies (dang_runtime + dang_migrator)
-- + minimal dang_runtime grants for schema catalog.
-- Lesson 0098/0099/0102: FORCE without migrator policy breaks prod still on migrator.
-- No DROP TABLE/COLUMN. No drizzle. No append-only table grants.
-- Membership = workspace_id = app.current_workspace_id() (app sets GUC after requireMember).
-- INSERT/UPDATE policies use matching WITH CHECK so rows cannot move tenant/owner.

--> statement-breakpoint
ALTER TABLE "catalog"."unit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."unit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_category" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_category" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item_price" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item_price" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item_usage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item_pin" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog"."catalog_item_pin" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ========== dang_runtime policies ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_runtime') THEN
    -- --- unit: system → SELECT همه؛ write فقط non-system + membership ---
    EXECUTE $pol$
      DROP POLICY IF EXISTS "unit_select_dang_runtime" ON "catalog"."unit"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "unit_select_dang_runtime"
      ON "catalog"."unit"
      FOR SELECT
      TO dang_runtime
      USING (
        "is_system" = true
        OR "workspace_id" = "app"."current_workspace_id"()
      )
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "unit_write_dang_runtime" ON "catalog"."unit"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "unit_write_dang_runtime"
      ON "catalog"."unit"
      FOR ALL
      TO dang_runtime
      USING (
        "is_system" = false
        AND "workspace_id" = "app"."current_workspace_id"()
      )
      WITH CHECK (
        "is_system" = false
        AND "workspace_id" = "app"."current_workspace_id"()
      )
    $pol$;

    -- --- catalog_category: NULL = سراسری (SELECT)؛ write فقط membership ---
    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_category_select_dang_runtime"
        ON "catalog"."catalog_category"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_category_select_dang_runtime"
      ON "catalog"."catalog_category"
      FOR SELECT
      TO dang_runtime
      USING (
        "workspace_id" IS NULL
        OR "workspace_id" = "app"."current_workspace_id"()
      )
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_category_write_dang_runtime"
        ON "catalog"."catalog_category"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_category_write_dang_runtime"
      ON "catalog"."catalog_category"
      FOR ALL
      TO dang_runtime
      USING (
        "workspace_id" IS NOT NULL
        AND "workspace_id" = "app"."current_workspace_id"()
      )
      WITH CHECK (
        "workspace_id" IS NOT NULL
        AND "workspace_id" = "app"."current_workspace_id"()
      )
    $pol$;

    -- --- catalog_item: owner_kind user|workspace ---
    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_owner_dang_runtime"
        ON "catalog"."catalog_item"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_owner_dang_runtime"
      ON "catalog"."catalog_item"
      FOR ALL
      TO dang_runtime
      USING (
        (
          "owner_kind" = 'user'
          AND "owner_user_id" = "app"."current_user_id"()
        )
        OR (
          "owner_kind" = 'workspace'
          AND "workspace_id" = "app"."current_workspace_id"()
        )
      )
      WITH CHECK (
        (
          "owner_kind" = 'user'
          AND "owner_user_id" = "app"."current_user_id"()
        )
        OR (
          "owner_kind" = 'workspace'
          AND "workspace_id" = "app"."current_workspace_id"()
        )
      )
    $pol$;

    -- --- catalog_item_price: via parent item visibility ---
    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_price_via_item_dang_runtime"
        ON "catalog"."catalog_item_price"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_price_via_item_dang_runtime"
      ON "catalog"."catalog_item_price"
      FOR ALL
      TO dang_runtime
      USING (
        EXISTS (
          SELECT 1
          FROM "catalog"."catalog_item" AS i
          WHERE i."id" = "catalog"."catalog_item_price"."item_id"
            AND (
              (
                i."owner_kind" = 'user'
                AND i."owner_user_id" = "app"."current_user_id"()
              )
              OR (
                i."owner_kind" = 'workspace'
                AND i."workspace_id" = "app"."current_workspace_id"()
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "catalog"."catalog_item" AS i
          WHERE i."id" = "catalog"."catalog_item_price"."item_id"
            AND (
              (
                i."owner_kind" = 'user'
                AND i."owner_user_id" = "app"."current_user_id"()
              )
              OR (
                i."owner_kind" = 'workspace'
                AND i."workspace_id" = "app"."current_workspace_id"()
              )
            )
        )
      )
    $pol$;

    -- --- usage / pin: workspace membership ---
    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_usage_tenant_dang_runtime"
        ON "catalog"."catalog_item_usage"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_usage_tenant_dang_runtime"
      ON "catalog"."catalog_item_usage"
      FOR ALL
      TO dang_runtime
      USING ("workspace_id" = "app"."current_workspace_id"())
      WITH CHECK ("workspace_id" = "app"."current_workspace_id"())
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_pin_tenant_dang_runtime"
        ON "catalog"."catalog_item_pin"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_pin_tenant_dang_runtime"
      ON "catalog"."catalog_item_pin"
      FOR ALL
      TO dang_runtime
      USING ("workspace_id" = "app"."current_workspace_id"())
      WITH CHECK ("workspace_id" = "app"."current_workspace_id"())
    $pol$;

    -- --- minimal grants (aligned with postgres-catalog.store.ts ops) ---
    EXECUTE 'GRANT USAGE ON SCHEMA catalog TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON catalog.unit TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON catalog.catalog_category TO dang_runtime';
    EXECUTE $g$
      GRANT UPDATE (name, slug, sort_order, active)
      ON catalog.catalog_category TO dang_runtime
    $g$;
    EXECUTE 'GRANT SELECT, INSERT ON catalog.catalog_item TO dang_runtime';
    EXECUTE $g$
      GRANT UPDATE (
        name, name_normalized, unit_code, reference_price_minor,
        description, category_id, sku, barcode, active, archived_at, updated_at
      ) ON catalog.catalog_item TO dang_runtime
    $g$;
    EXECUTE 'GRANT SELECT, INSERT ON catalog.catalog_item_price TO dang_runtime';
    EXECUTE 'GRANT SELECT, INSERT ON catalog.catalog_item_usage TO dang_runtime';
    EXECUTE $g$
      GRANT UPDATE (use_count, last_used_at)
      ON catalog.catalog_item_usage TO dang_runtime
    $g$;
    EXECUTE 'GRANT SELECT, INSERT, DELETE ON catalog.catalog_item_pin TO dang_runtime';
  END IF;
END $$;
--> statement-breakpoint

-- ========== dang_migrator policies (parity; no extra GRANT — owner already has DML) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dang_migrator') THEN
    -- unit: migrator may write system seed + workspace rows
    EXECUTE $pol$
      DROP POLICY IF EXISTS "unit_all_dang_migrator" ON "catalog"."unit"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "unit_all_dang_migrator"
      ON "catalog"."unit"
      FOR ALL
      TO dang_migrator
      USING (
        "is_system" = true
        OR "workspace_id" = "app"."current_workspace_id"()
      )
      WITH CHECK (
        "is_system" = true
        OR "workspace_id" = "app"."current_workspace_id"()
      )
    $pol$;

    -- category: migrator may write global (NULL) + workspace
    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_category_all_dang_migrator"
        ON "catalog"."catalog_category"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_category_all_dang_migrator"
      ON "catalog"."catalog_category"
      FOR ALL
      TO dang_migrator
      USING (
        "workspace_id" IS NULL
        OR "workspace_id" = "app"."current_workspace_id"()
      )
      WITH CHECK (
        "workspace_id" IS NULL
        OR "workspace_id" = "app"."current_workspace_id"()
      )
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_owner_dang_migrator"
        ON "catalog"."catalog_item"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_owner_dang_migrator"
      ON "catalog"."catalog_item"
      FOR ALL
      TO dang_migrator
      USING (
        (
          "owner_kind" = 'user'
          AND "owner_user_id" = "app"."current_user_id"()
        )
        OR (
          "owner_kind" = 'workspace'
          AND "workspace_id" = "app"."current_workspace_id"()
        )
      )
      WITH CHECK (
        (
          "owner_kind" = 'user'
          AND "owner_user_id" = "app"."current_user_id"()
        )
        OR (
          "owner_kind" = 'workspace'
          AND "workspace_id" = "app"."current_workspace_id"()
        )
      )
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_price_via_item_dang_migrator"
        ON "catalog"."catalog_item_price"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_price_via_item_dang_migrator"
      ON "catalog"."catalog_item_price"
      FOR ALL
      TO dang_migrator
      USING (
        EXISTS (
          SELECT 1
          FROM "catalog"."catalog_item" AS i
          WHERE i."id" = "catalog"."catalog_item_price"."item_id"
            AND (
              (
                i."owner_kind" = 'user'
                AND i."owner_user_id" = "app"."current_user_id"()
              )
              OR (
                i."owner_kind" = 'workspace'
                AND i."workspace_id" = "app"."current_workspace_id"()
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM "catalog"."catalog_item" AS i
          WHERE i."id" = "catalog"."catalog_item_price"."item_id"
            AND (
              (
                i."owner_kind" = 'user'
                AND i."owner_user_id" = "app"."current_user_id"()
              )
              OR (
                i."owner_kind" = 'workspace'
                AND i."workspace_id" = "app"."current_workspace_id"()
              )
            )
        )
      )
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_usage_tenant_dang_migrator"
        ON "catalog"."catalog_item_usage"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_usage_tenant_dang_migrator"
      ON "catalog"."catalog_item_usage"
      FOR ALL
      TO dang_migrator
      USING ("workspace_id" = "app"."current_workspace_id"())
      WITH CHECK ("workspace_id" = "app"."current_workspace_id"())
    $pol$;

    EXECUTE $pol$
      DROP POLICY IF EXISTS "catalog_item_pin_tenant_dang_migrator"
        ON "catalog"."catalog_item_pin"
    $pol$;
    EXECUTE $pol$
      CREATE POLICY "catalog_item_pin_tenant_dang_migrator"
      ON "catalog"."catalog_item_pin"
      FOR ALL
      TO dang_migrator
      USING ("workspace_id" = "app"."current_workspace_id"())
      WITH CHECK ("workspace_id" = "app"."current_workspace_id"())
    $pol$;
  END IF;
END $$;
