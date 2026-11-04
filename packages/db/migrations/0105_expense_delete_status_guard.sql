-- Additive: narrow 0104 DELETE policies so only draft/reversed expenses can be purged.
-- Same policy names (permissive policies OR together — extra policies alone would not block).
-- No GRANT, no FORCE, no ENABLE/DISABLE RLS, no role changes.

--> statement-breakpoint
DO $$ BEGIN
  EXECUTE $pol$
    DROP POLICY IF EXISTS "expense_tenant_delete" ON "finance"."expense"
  $pol$;
  EXECUTE $pol$
    CREATE POLICY "expense_tenant_delete"
    ON "finance"."expense" FOR DELETE
    USING (
      "workspace_id" = "app"."current_workspace_id"()
      AND "status" IN ('draft', 'reversed')
    )
  $pol$;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE $pol$
    DROP POLICY IF EXISTS "expense_split_tenant_delete"
      ON "finance"."expense_split_line"
  $pol$;
  EXECUTE $pol$
    CREATE POLICY "expense_split_tenant_delete"
    ON "finance"."expense_split_line" FOR DELETE
    USING (
      "workspace_id" = "app"."current_workspace_id"()
      AND EXISTS (
        SELECT 1
        FROM "finance"."expense" AS e
        WHERE e."id" = "expense_id"
          AND e."workspace_id" = "workspace_id"
          AND e."workspace_id" = "app"."current_workspace_id"()
          AND e."status" IN ('draft', 'reversed')
      )
    )
  $pol$;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE $pol$
    DROP POLICY IF EXISTS "expense_payment_tenant_delete"
      ON "finance"."expense_payment_line"
  $pol$;
  EXECUTE $pol$
    CREATE POLICY "expense_payment_tenant_delete"
    ON "finance"."expense_payment_line" FOR DELETE
    USING (
      "workspace_id" = "app"."current_workspace_id"()
      AND EXISTS (
        SELECT 1
        FROM "finance"."expense" AS e
        WHERE e."id" = "expense_id"
          AND e."workspace_id" = "workspace_id"
          AND e."workspace_id" = "app"."current_workspace_id"()
          AND e."status" IN ('draft', 'reversed')
      )
    )
  $pol$;
END $$;
