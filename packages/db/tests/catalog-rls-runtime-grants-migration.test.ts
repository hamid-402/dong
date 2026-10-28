/**
 * Migration 0103 — catalog.* RLS + dual-role policies + minimal runtime grants.
 * File checks always run. Live probes skip when DATABASE_URL unset or 0103 not applied.
 * Accepts dang_runtime or dang_migrator (NOBYPASSRLS). Does not read .env.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  and,
  catalogCategory,
  catalogItem,
  catalogItemPin,
  catalogItemPrice,
  catalogItemUsage,
  createDatabase,
  eq,
  isNull,
  membership,
  unit,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";
import {
  EXPECTED_RUNTIME_TABLE_PRIVS,
  EXPECTED_SCHEMA_USAGE,
} from "../scripts/runtime-privilege-expected.mjs";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0103_catalog_rls_runtime_grants.sql",
);

const TABLES = [
  "unit",
  "catalog_category",
  "catalog_item",
  "catalog_item_price",
  "catalog_item_usage",
  "catalog_item_pin",
] as const;

const POLICY_RUNTIME = [
  "unit_select_dang_runtime",
  "unit_write_dang_runtime",
  "catalog_category_select_dang_runtime",
  "catalog_category_write_dang_runtime",
  "catalog_item_owner_dang_runtime",
  "catalog_item_price_via_item_dang_runtime",
  "catalog_item_usage_tenant_dang_runtime",
  "catalog_item_pin_tenant_dang_runtime",
] as const;

const POLICY_MIGRATOR = [
  "unit_all_dang_migrator",
  "catalog_category_all_dang_migrator",
  "catalog_item_owner_dang_migrator",
  "catalog_item_price_via_item_dang_migrator",
  "catalog_item_usage_tenant_dang_migrator",
  "catalog_item_pin_tenant_dang_migrator",
] as const;

function stripSqlComments(raw: string): string {
  return raw.replace(/--[^\n]*/g, "");
}

describe("0103 catalog RLS runtime grants file checks", () => {
  it("enables FORCE RLS and dual-role policies with column grants", () => {
    const migration = stripSqlComments(readFileSync(migrationPath, "utf8"));

    for (const table of TABLES) {
      assert.match(
        migration,
        new RegExp(
          `ALTER TABLE "catalog"\\."${table}" ENABLE ROW LEVEL SECURITY`,
          "i",
        ),
      );
      assert.match(
        migration,
        new RegExp(
          `ALTER TABLE "catalog"\\."${table}" FORCE ROW LEVEL SECURITY`,
          "i",
        ),
      );
    }

    for (const name of POLICY_RUNTIME) {
      assert.match(migration, new RegExp(name));
    }
    for (const name of POLICY_MIGRATOR) {
      assert.match(migration, new RegExp(name));
    }

    assert.match(migration, /TO dang_runtime/);
    assert.match(migration, /TO dang_migrator/);
    assert.match(migration, /WITH CHECK/);
    assert.match(migration, /GRANT USAGE ON SCHEMA catalog TO dang_runtime/);
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON catalog\.unit TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON catalog\.catalog_category TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT UPDATE \(\s*name, slug, sort_order, active\s*\)\s*ON catalog\.catalog_category TO dang_runtime/s,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON catalog\.catalog_item TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT UPDATE \(\s*name, name_normalized, unit_code, reference_price_minor,\s*description, category_id, sku, barcode, active, archived_at, updated_at\s*\)\s*ON catalog\.catalog_item TO dang_runtime/s,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON catalog\.catalog_item_price TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON catalog\.catalog_item_usage TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT UPDATE \(\s*use_count, last_used_at\s*\)\s*ON catalog\.catalog_item_usage TO dang_runtime/s,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT, DELETE ON catalog\.catalog_item_pin TO dang_runtime/,
    );

    // Column UPDATE must never include ownership / tenant keys
    assert.doesNotMatch(
      migration,
      /GRANT UPDATE \([^)]*owner_kind[^)]*\) ON catalog\.catalog_item/i,
    );
    assert.doesNotMatch(
      migration,
      /GRANT UPDATE \([^)]*owner_user_id[^)]*\) ON catalog\.catalog_item/i,
    );
    assert.doesNotMatch(
      migration,
      /GRANT UPDATE \([^)]*workspace_id[^)]*\) ON catalog\./i,
    );

    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /DROP COLUMN/i);
    assert.doesNotMatch(migration, /GRANT[^;]*ON SCHEMA drizzle/i);
  });

  it("is registered in the Drizzle migration journal after 0102", () => {
    const journal = readFileSync(
      resolve(process.cwd(), "migrations/meta/_journal.json"),
      "utf8",
    );
    assert.match(journal, /0102_personal_rls_runtime_grants/);
    assert.match(journal, /0103_catalog_rls_runtime_grants/);
  });

  it("privilege expected matrix marks catalog USAGE and table grants", () => {
    assert.equal(EXPECTED_SCHEMA_USAGE.catalog, true);
    assert.equal(EXPECTED_SCHEMA_USAGE.drizzle, false);
    assert.equal(EXPECTED_RUNTIME_TABLE_PRIVS["catalog.unit"].update, false);
    assert.equal(
      EXPECTED_RUNTIME_TABLE_PRIVS["catalog.catalog_item_pin"].delete,
      true,
    );
    assert.equal(
      EXPECTED_RUNTIME_TABLE_PRIVS["catalog.catalog_item_price"].update,
      false,
    );
  });
});

async function assertAppRoleNoBypass(
  pool: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> },
  label: string,
): Promise<string> {
  const roleProbe = await pool.query(`
    select current_user::text as current_user, r.rolsuper, r.rolbypassrls
    from pg_roles r where r.rolname = current_user
  `);
  const probe = roleProbe.rows[0] as
    | { current_user: string; rolsuper: boolean; rolbypassrls: boolean }
    | undefined;
  if (!probe || probe.rolsuper || probe.rolbypassrls) {
    assert.fail(
      `${label} must run as NOBYPASSRLS app role (got ${probe?.current_user ?? "?"}); use dang_runtime or dang_migrator`,
    );
  }
  return probe.current_user;
}

async function catalog0103Applied(
  pool: {
    query: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: Array<Record<string, unknown>> }>;
  },
): Promise<boolean> {
  for (const table of TABLES) {
    const probe = await pool.query(
      `
      select c.relrowsecurity as rls, c.relforcerowsecurity as force
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'catalog' and c.relname = $1
    `,
      [table],
    );
    const row = probe.rows[0] as { rls: boolean; force: boolean } | undefined;
    if (!row?.rls || !row?.force) return false;
  }
  return true;
}

describe("0103 catalog RLS live invariants + parity CRUD", () => {
  it("RLS+FORCE, dual policies, grants; short CRUD under current app role", async (t) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set — skip 0103 live invariants (no .env load)");
      return;
    }

    const { db, pool, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const portProbe = await pool.query<{ p: number | null }>(
      `select inet_server_port() as p`,
    );
    const port = portProbe.rows[0]?.p;
    if (port === 5437) {
      assert.fail("refusing live DB on port 5437");
    }
    if (port != null && port !== 5432) {
      assert.fail(`refusing live DB on port ${port}; only 5432 allowed`);
    }

    const roleName = await assertAppRoleNoBypass(pool, "0103 catalog RLS");
    if (!(await catalog0103Applied(pool))) {
      t.skip("catalog RLS runtime grants (0103) not applied yet");
      return;
    }

    const expectedByTable: Record<string, string[]> = {
      unit: ["unit_select_dang_runtime", "unit_write_dang_runtime", "unit_all_dang_migrator"],
      catalog_category: [
        "catalog_category_select_dang_runtime",
        "catalog_category_write_dang_runtime",
        "catalog_category_all_dang_migrator",
      ],
      catalog_item: [
        "catalog_item_owner_dang_runtime",
        "catalog_item_owner_dang_migrator",
      ],
      catalog_item_price: [
        "catalog_item_price_via_item_dang_runtime",
        "catalog_item_price_via_item_dang_migrator",
      ],
      catalog_item_usage: [
        "catalog_item_usage_tenant_dang_runtime",
        "catalog_item_usage_tenant_dang_migrator",
      ],
      catalog_item_pin: [
        "catalog_item_pin_tenant_dang_runtime",
        "catalog_item_pin_tenant_dang_migrator",
      ],
    };

    for (const table of TABLES) {
      const policies = await pool.query<{ polname: string }>(
        `
        select pol.polname::text as polname
        from pg_policy pol
        join pg_class c on c.oid = pol.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'catalog' and c.relname = $1
      `,
        [table],
      );
      const names = policies.rows.map((r) => r.polname);
      for (const p of expectedByTable[table] ?? []) {
        assert.ok(names.includes(p), `${table} missing ${p}`);
      }
    }

    if (roleName === "dang_runtime") {
      for (const [fqn, want] of Object.entries(EXPECTED_RUNTIME_TABLE_PRIVS)) {
        if (!fqn.startsWith("catalog.")) continue;
        const q = await pool.query<{
          s: boolean;
          i: boolean;
          u: boolean;
          d: boolean;
        }>(
          `
          select
            has_table_privilege(current_user, $1, 'SELECT') as s,
            has_table_privilege(current_user, $1, 'INSERT') as i,
            has_table_privilege(current_user, $1, 'UPDATE') as u,
            has_table_privilege(current_user, $1, 'DELETE') as d
        `,
          [fqn],
        );
        const row = q.rows[0];
        assert.equal(Boolean(row?.s), want.select, `${fqn} SELECT`);
        assert.equal(Boolean(row?.i), want.insert, `${fqn} INSERT`);
        assert.equal(Boolean(row?.u), want.update, `${fqn} UPDATE`);
        assert.equal(Boolean(row?.d), want.delete, `${fqn} DELETE`);
      }
    }

    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const unitCode = `u${workspaceId.replaceAll("-", "").slice(0, 10)}`;

    await db.insert(userAccount).values({
      id: userId,
      externalSubject: `catalog-rls-${userId}`,
      displayName: "Catalog RLS",
    });

    await withTenantContext(db, { workspaceId, userId }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceId,
        slug: `cat-${workspaceId.slice(0, 8)}`,
        name: "Catalog RLS WS",
        template: "friends_family",
        createdBy: userId,
      });
      await tx.insert(membership).values({
        workspaceId,
        userId,
        role: "owner",
      });

      await tx.insert(unit).values({
        code: unitCode,
        labelFa: "واحد تست",
        labelEn: "test unit",
        kind: "count",
        isSystem: false,
        workspaceId,
      });

      await tx.insert(catalogCategory).values({
        id: categoryId,
        workspaceId,
        name: "دسته تست",
        slug: "test-cat",
        sortOrder: 1,
        active: true,
        createdByUserId: userId,
      });

      await tx
        .update(catalogCategory)
        .set({ name: "دسته تست ۲", slug: "test-cat-2" })
        .where(eq(catalogCategory.id, categoryId));

      await tx.insert(catalogItem).values({
        id: itemId,
        ownerKind: "workspace",
        workspaceId,
        ownerUserId: null,
        categoryId,
        name: "کالای تست",
        nameNormalized: "کالای تست",
        unitCode: "piece",
        referencePriceMinor: 1000n,
        createdByUserId: userId,
      });

      await tx.insert(catalogItemPrice).values({
        itemId,
        priceMinor: 1000n,
        createdByUserId: userId,
      });

      await tx
        .update(catalogItem)
        .set({
          referencePriceMinor: 1500n,
          updatedAt: new Date(),
        })
        .where(eq(catalogItem.id, itemId));

      await tx.insert(catalogItemPrice).values({
        itemId,
        priceMinor: 1500n,
        createdByUserId: userId,
      });

      await tx.insert(catalogItemUsage).values({
        workspaceId,
        itemId,
        useCount: 1,
        lastUsedAt: new Date(),
      });

      await tx
        .update(catalogItemUsage)
        .set({ useCount: 2, lastUsedAt: new Date() })
        .where(
          and(
            eq(catalogItemUsage.workspaceId, workspaceId),
            eq(catalogItemUsage.itemId, itemId),
          ),
        );

      await tx.insert(catalogItemPin).values({
        workspaceId,
        itemId,
        pinnedByUserId: userId,
        sortOrder: 0,
      });

      const items = await tx
        .select()
        .from(catalogItem)
        .where(eq(catalogItem.id, itemId));
      assert.equal(items.length, 1);
      assert.equal(items[0]?.referencePriceMinor, 1500n);

      const pins = await tx
        .select()
        .from(catalogItemPin)
        .where(eq(catalogItemPin.workspaceId, workspaceId));
      assert.equal(pins.length, 1);

      await tx
        .delete(catalogItemPin)
        .where(eq(catalogItemPin.workspaceId, workspaceId));
      const pinsAfter = await tx
        .select()
        .from(catalogItemPin)
        .where(eq(catalogItemPin.workspaceId, workspaceId));
      assert.equal(pinsAfter.length, 0);
    });

    // system units still SELECT-visible
    const systemUnits = await withTenantContext(
      db,
      { workspaceId, userId },
      async (tx) => {
        return tx.select().from(unit).where(eq(unit.isSystem, true)).limit(3);
      },
    );
    assert.ok(systemUnits.length >= 1);

    // runtime cannot write system unit or global category
    if (roleName === "dang_runtime") {
      const assertRlsDeny = (err: unknown) => {
        const e = err as {
          message?: string;
          code?: string;
          cause?: { message?: string; code?: string };
        };
        const blob = [e.message, e.code, e.cause?.message, e.cause?.code]
          .filter(Boolean)
          .join(" ");
        assert.match(blob, /policy|42501|violates/i);
        return true;
      };

      await assert.rejects(
        async () => {
          await withTenantContext(db, { workspaceId, userId }, async (tx) => {
            await tx.insert(unit).values({
              code: `sys${workspaceId.replaceAll("-", "").slice(0, 8)}`,
              labelFa: "سیستم جعلی",
              labelEn: "fake system",
              kind: "count",
              isSystem: true,
              workspaceId: null,
            });
          });
        },
        assertRlsDeny,
      );

      await assert.rejects(
        async () => {
          await withTenantContext(db, { workspaceId, userId }, async (tx) => {
            await tx.insert(catalogCategory).values({
              id: crypto.randomUUID(),
              workspaceId: null,
              name: "سراسری جعلی",
              slug: "fake-global",
              sortOrder: 99,
              active: true,
              createdByUserId: userId,
            });
          });
        },
        assertRlsDeny,
      );
    }
  });
});

describe("0103 catalog RLS isolation + unset workspace deny", () => {
  it("isolates workspace rows and user-owned items; denies when workspace GUC unset", async (t) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set — skip catalog RLS isolation (no .env load)");
      return;
    }

    const { db, pool, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const portProbe = await pool.query<{ p: number | null }>(
      `select inet_server_port() as p`,
    );
    const port = portProbe.rows[0]?.p;
    if (port === 5437) {
      assert.fail("refusing live DB on port 5437");
    }
    if (port != null && port !== 5432) {
      assert.fail(`refusing live DB on port ${port}; only 5432 allowed`);
    }

    await assertAppRoleNoBypass(pool, "catalog RLS isolation");
    if (!(await catalog0103Applied(pool))) {
      t.skip("catalog RLS runtime grants (0103) not applied yet");
      return;
    }

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const itemA = crypto.randomUUID();
    const itemUserA = crypto.randomUUID();
    const pinItem = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `catalog-rls-a-${userA}`,
        displayName: "Catalog A",
      },
      {
        id: userB,
        externalSubject: `catalog-rls-b-${userB}`,
        displayName: "Catalog B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `cata-${workspaceA.slice(0, 8)}`,
        name: "Catalog WS A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
      await tx.insert(catalogItem).values({
        id: itemA,
        ownerKind: "workspace",
        workspaceId: workspaceA,
        ownerUserId: null,
        name: "A item",
        nameNormalized: "a item",
        unitCode: "piece",
        referencePriceMinor: 100n,
        createdByUserId: userA,
      });
      await tx.insert(catalogItem).values({
        id: pinItem,
        ownerKind: "workspace",
        workspaceId: workspaceA,
        ownerUserId: null,
        name: "A pin item",
        nameNormalized: "a pin item",
        unitCode: "piece",
        referencePriceMinor: 200n,
        createdByUserId: userA,
      });
      await tx.insert(catalogItemUsage).values({
        workspaceId: workspaceA,
        itemId: itemA,
        useCount: 3,
        lastUsedAt: new Date(),
      });
      await tx.insert(catalogItemPin).values({
        workspaceId: workspaceA,
        itemId: pinItem,
        pinnedByUserId: userA,
        sortOrder: 0,
      });
    });

    // user-owned item (needs user GUC; no workspace membership required for ownership)
    await withTenantContext(db, { userId: userA }, async (tx) => {
      await tx.insert(catalogItem).values({
        id: itemUserA,
        ownerKind: "user",
        workspaceId: null,
        ownerUserId: userA,
        name: "Personal A",
        nameNormalized: "personal a",
        unitCode: "piece",
        referencePriceMinor: 50n,
        createdByUserId: userA,
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `catb-${workspaceB.slice(0, 8)}`,
        name: "Catalog WS B",
        template: "friends_family",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
    });

    const bSeesAItem = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) => tx.select().from(catalogItem).where(eq(catalogItem.id, itemA)),
    );
    assert.equal(bSeesAItem.length, 0);

    const bSeesAUsage = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx
          .select()
          .from(catalogItemUsage)
          .where(eq(catalogItemUsage.workspaceId, workspaceA)),
    );
    assert.equal(bSeesAUsage.length, 0);

    const bSeesAPin = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx
          .select()
          .from(catalogItemPin)
          .where(eq(catalogItemPin.workspaceId, workspaceA)),
    );
    assert.equal(bSeesAPin.length, 0);

    const bSeesUserA = await withTenantContext(
      db,
      { userId: userB },
      async (tx) =>
        tx.select().from(catalogItem).where(eq(catalogItem.id, itemUserA)),
    );
    assert.equal(bSeesUserA.length, 0);

    const aSeesOwn = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) => {
        const items = await tx
          .select()
          .from(catalogItem)
          .where(eq(catalogItem.id, itemA));
        const usage = await tx
          .select()
          .from(catalogItemUsage)
          .where(eq(catalogItemUsage.itemId, itemA));
        const pins = await tx
          .select()
          .from(catalogItemPin)
          .where(eq(catalogItemPin.workspaceId, workspaceA));
        return {
          items: items.length,
          usage: usage.length,
          pins: pins.length,
        };
      },
    );
    assert.deepEqual(aSeesOwn, { items: 1, usage: 1, pins: 1 });

    const aSeesPersonal = await withTenantContext(
      db,
      { userId: userA },
      async (tx) =>
        tx.select().from(catalogItem).where(eq(catalogItem.id, itemUserA)),
    );
    assert.equal(aSeesPersonal.length, 1);

    // Explicit: unset / null current_workspace_id denies workspace-scoped rows
    const unsetSeesWorkspaceItem = await withTenantContext(
      db,
      { userId: userA },
      async (tx) =>
        tx.select().from(catalogItem).where(eq(catalogItem.id, itemA)),
    );
    assert.equal(
      unsetSeesWorkspaceItem.length,
      0,
      "workspace-scoped item must be denied when current_workspace_id is unset/null",
    );

    const unsetSeesUsage = await withTenantContext(
      db,
      { userId: userA },
      async (tx) =>
        tx
          .select()
          .from(catalogItemUsage)
          .where(eq(catalogItemUsage.workspaceId, workspaceA)),
    );
    assert.equal(
      unsetSeesUsage.length,
      0,
      "usage must be denied when current_workspace_id is unset/null",
    );

    const unsetSeesPin = await withTenantContext(
      db,
      { userId: userA },
      async (tx) =>
        tx
          .select()
          .from(catalogItemPin)
          .where(eq(catalogItemPin.workspaceId, workspaceA)),
    );
    assert.equal(
      unsetSeesPin.length,
      0,
      "pin must be denied when current_workspace_id is unset/null",
    );

    // system units + global categories still SELECT without workspace GUC
    const globalsWithoutWs = await withTenantContext(
      db,
      { userId: userA },
      async (tx) => {
        const units = await tx
          .select()
          .from(unit)
          .where(eq(unit.isSystem, true))
          .limit(1);
        const cats = await tx
          .select()
          .from(catalogCategory)
          .where(isNull(catalogCategory.workspaceId))
          .limit(1);
        return { units: units.length, cats: cats.length };
      },
    );
    assert.ok(globalsWithoutWs.units >= 1);
    assert.ok(globalsWithoutWs.cats >= 1);
  });
});
