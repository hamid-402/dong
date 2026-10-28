/**
 * Migration 0102 — personal.* RLS + dual-role policies + minimal runtime grants.
 * File checks always run. Live probes skip when DATABASE_URL unset or 0102 not applied.
 * Accepts dang_runtime or dang_migrator (NOBYPASSRLS). Does not read .env.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  allocationPlan,
  createDatabase,
  eq,
  moneyIntent,
  paycheck,
  userAccount,
  withTenantContext,
} from "../src/index.ts";
import {
  EXPECTED_RUNTIME_TABLE_PRIVS,
  EXPECTED_SCHEMA_USAGE,
} from "../scripts/runtime-privilege-expected.mjs";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0102_personal_rls_runtime_grants.sql",
);

const TABLES = ["money_intent", "allocation_plan", "paycheck"] as const;

function stripSqlComments(raw: string): string {
  return raw.replace(/--[^\n]*/g, "");
}

describe("0102 personal RLS runtime grants file checks", () => {
  it("enables FORCE RLS and dual-role owner policies with column grants", () => {
    const migration = stripSqlComments(readFileSync(migrationPath, "utf8"));

    for (const table of TABLES) {
      assert.match(
        migration,
        new RegExp(
          `ALTER TABLE "personal"\\."${table}" ENABLE ROW LEVEL SECURITY`,
          "i",
        ),
      );
      assert.match(
        migration,
        new RegExp(
          `ALTER TABLE "personal"\\."${table}" FORCE ROW LEVEL SECURITY`,
          "i",
        ),
      );
      assert.match(migration, new RegExp(`${table}_owner_dang_runtime`));
      assert.match(migration, new RegExp(`${table}_owner_dang_migrator`));
    }

    assert.match(migration, /TO dang_runtime/);
    assert.match(migration, /TO dang_migrator/);
    assert.match(migration, /user_id" = "app"\."current_user_id"\(\)/);
    assert.match(migration, /GRANT USAGE ON SCHEMA personal TO dang_runtime/);
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON personal\.money_intent TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT UPDATE \(\s*name, period, target_minor, target_percent, goal_id, active, updated_at\s*\) ON personal\.money_intent TO dang_runtime/s,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON personal\.allocation_plan TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT UPDATE \(\s*solo_percent, group_percent, building_percent, org_percent,\s*savings_percent, updated_at\s*\) ON personal\.allocation_plan TO dang_runtime/s,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT ON personal\.paycheck TO dang_runtime/,
    );
    assert.doesNotMatch(
      migration,
      /GRANT[^;]*UPDATE[^;]*ON personal\.paycheck/i,
    );
    assert.doesNotMatch(migration, /GRANT[^;]*ON SCHEMA catalog/i);
    assert.doesNotMatch(migration, /GRANT[^;]*ON SCHEMA drizzle/i);
    assert.doesNotMatch(migration, /audit\.event/i);
    assert.doesNotMatch(migration, /vault_access_log/i);
    assert.doesNotMatch(migration, /security_event/i);
    assert.doesNotMatch(migration, /etl_run/i);
    assert.doesNotMatch(migration, /webhook_delivery/i);
    assert.doesNotMatch(migration, /subscription_payment_map/i);
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /DROP COLUMN/i);
  });

  it("is registered in the Drizzle migration journal after 0101", () => {
    const journal = readFileSync(
      resolve(process.cwd(), "migrations/meta/_journal.json"),
      "utf8",
    );
    assert.match(journal, /0101_force_rls_g03_g04_g10/);
    assert.match(journal, /0102_personal_rls_runtime_grants/);
  });

  it("privilege expected matrix marks append-only UPDATE=false and personal grants", () => {
    assert.equal(EXPECTED_RUNTIME_TABLE_PRIVS["personal.paycheck"].update, false);
    assert.equal(EXPECTED_RUNTIME_TABLE_PRIVS["audit.event"].update, false);
    assert.equal(EXPECTED_RUNTIME_TABLE_PRIVS["ops.vault_access_log"].update, false);
    assert.equal(EXPECTED_RUNTIME_TABLE_PRIVS["personal.money_intent"].update, false); // column UPDATE only
    assert.equal(EXPECTED_RUNTIME_TABLE_PRIVS["personal.allocation_plan"].update, false); // column UPDATE only
    assert.equal(EXPECTED_SCHEMA_USAGE.catalog, true); // 0103 grants schema USAGE
    assert.equal(EXPECTED_SCHEMA_USAGE.drizzle, false);
    assert.equal(EXPECTED_SCHEMA_USAGE.personal, true);
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

async function personal0102Applied(
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
      where n.nspname = 'personal' and c.relname = $1
    `,
      [table],
    );
    const row = probe.rows[0] as { rls: boolean; force: boolean } | undefined;
    if (!row?.rls || !row?.force) return false;
  }
  return true;
}

describe("0102 personal RLS live invariants + parity", () => {
  it("RLS+FORCE, dual policies, grants; owner CRUD under current app role", async (t) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set — skip 0102 live invariants (no .env load)");
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

    const roleName = await assertAppRoleNoBypass(pool, "0102 personal RLS");
    if (!(await personal0102Applied(pool))) {
      t.skip("personal RLS runtime grants (0102) not applied yet");
      return;
    }

    for (const table of TABLES) {
      const policies = await pool.query<{ polname: string; roles: string[] }>(
        `
        select pol.polname::text as polname, ARRAY(
          SELECT rol.rolname::text FROM pg_roles rol
          WHERE rol.oid = ANY (pol.polroles)
        ) as roles
        from pg_policy pol
        join pg_class c on c.oid = pol.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'personal' and c.relname = $1
      `,
        [table],
      );
      const names = policies.rows.map((r) => r.polname);
      assert.ok(
        names.includes(`${table}_owner_dang_runtime`),
        `${table} missing dang_runtime policy`,
      );
      assert.ok(
        names.includes(`${table}_owner_dang_migrator`),
        `${table} missing dang_migrator policy`,
      );
    }

    if (roleName === "dang_runtime") {
      for (const [fqn, want] of Object.entries(EXPECTED_RUNTIME_TABLE_PRIVS)) {
        if (!fqn.startsWith("personal.")) continue;
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
    const intentId = crypto.randomUUID();
    const paycheckId = crypto.randomUUID();

    await db.insert(userAccount).values({
      id: userId,
      externalSubject: `personal-rls-${userId}`,
      displayName: "Personal RLS",
    });

    await withTenantContext(db, { userId }, async (tx) => {
      await tx.insert(moneyIntent).values({
        id: intentId,
        userId,
        name: "parity intent",
        kind: "spend_cap_amount",
        period: "month",
        targetMinor: 500000n,
        active: true,
        idempotencyKey: `intent-${intentId}`,
      });
      const intents = await tx
        .select()
        .from(moneyIntent)
        .where(eq(moneyIntent.id, intentId));
      assert.equal(intents.length, 1);

      await tx
        .update(moneyIntent)
        .set({ name: "parity intent updated", updatedAt: new Date() })
        .where(eq(moneyIntent.id, intentId));

      await tx.insert(allocationPlan).values({
        userId,
        soloPercent: 40,
        groupPercent: 15,
        buildingPercent: 10,
        orgPercent: 5,
        savingsPercent: 30,
      });
      await tx
        .update(allocationPlan)
        .set({
          soloPercent: 35,
          savingsPercent: 35,
          updatedAt: new Date(),
        })
        .where(eq(allocationPlan.userId, userId));
      const plans = await tx
        .select()
        .from(allocationPlan)
        .where(eq(allocationPlan.userId, userId));
      assert.equal(plans.length, 1);
      assert.equal(plans[0]?.soloPercent, 35);

      await tx.insert(paycheck).values({
        id: paycheckId,
        userId,
        yearMonth: "1499-01",
        amountMinor: 1_000_000n,
        currency: "IRR",
        occurredOn: "2026-01-15",
        idempotencyKey: `pc-${paycheckId}`,
      });
      const pcs = await tx
        .select()
        .from(paycheck)
        .where(eq(paycheck.id, paycheckId));
      assert.equal(pcs.length, 1);
    });
  });
});

describe("0102 personal RLS isolation", () => {
  it("keeps money_intent, allocation_plan, paycheck private across users", async (t) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      t.skip("DATABASE_URL not set — skip personal RLS isolation (no .env load)");
      return;
    }

    const { db, pool, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    await assertAppRoleNoBypass(pool, "personal RLS isolation");
    if (!(await personal0102Applied(pool))) {
      t.skip("personal RLS runtime grants (0102) not applied yet");
      return;
    }

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const intentId = crypto.randomUUID();
    const paycheckId = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `personal-rls-a-${userA}`,
        displayName: "Personal A",
      },
      {
        id: userB,
        externalSubject: `personal-rls-b-${userB}`,
        displayName: "Personal B",
      },
    ]);

    await withTenantContext(db, { userId: userA }, async (tx) => {
      await tx.insert(moneyIntent).values({
        id: intentId,
        userId: userA,
        name: "A intent",
        kind: "spend_cap_amount",
        period: "month",
        targetMinor: 100000n,
        active: true,
        idempotencyKey: `intent-a-${intentId}`,
      });
      await tx.insert(allocationPlan).values({
        userId: userA,
        soloPercent: 40,
        groupPercent: 15,
        buildingPercent: 10,
        orgPercent: 5,
        savingsPercent: 30,
      });
      await tx.insert(paycheck).values({
        id: paycheckId,
        userId: userA,
        yearMonth: "1498-12",
        amountMinor: 2_000_000n,
        currency: "IRR",
        occurredOn: "2025-12-01",
        idempotencyKey: `pc-a-${paycheckId}`,
      });
    });

    const bSeesIntent = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx.select().from(moneyIntent).where(eq(moneyIntent.id, intentId));
    });
    assert.equal(bSeesIntent.length, 0);

    const bSeesPlan = await withTenantContext(db, { userId: userB }, async (tx) => {
      return tx
        .select()
        .from(allocationPlan)
        .where(eq(allocationPlan.userId, userA));
    });
    assert.equal(bSeesPlan.length, 0);

    const bSeesPaycheck = await withTenantContext(
      db,
      { userId: userB },
      async (tx) => {
        return tx.select().from(paycheck).where(eq(paycheck.id, paycheckId));
      },
    );
    assert.equal(bSeesPaycheck.length, 0);

    const aSeesOwn = await withTenantContext(db, { userId: userA }, async (tx) => {
      const intents = await tx
        .select()
        .from(moneyIntent)
        .where(eq(moneyIntent.id, intentId));
      const plans = await tx
        .select()
        .from(allocationPlan)
        .where(eq(allocationPlan.userId, userA));
      const pcs = await tx.select().from(paycheck).where(eq(paycheck.id, paycheckId));
      return { intents: intents.length, plans: plans.length, pcs: pcs.length };
    });
    assert.deepEqual(aSeesOwn, { intents: 1, plans: 1, pcs: 1 });
  });
});
