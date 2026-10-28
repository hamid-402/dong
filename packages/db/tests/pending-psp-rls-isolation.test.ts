/**
 * pending_* PSP RLS (migration 0098) — dang_runtime policies + capability GUCs.
 *
 * Skips when DATABASE_URL is unset. Requires NOBYPASSRLS runtime role.
 * Does not read .env — set DATABASE_URL in the process environment to run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  createDatabase,
  eq,
  membership,
  pendingLocalPspPayment,
  pendingZarinpalPayment,
  sql,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0098_pending_psp_rls.sql",
);

describe("0098 pending PSP RLS file checks", () => {
  it("enables FORCE RLS and dang_runtime policies without payee FK work", () => {
    const raw = readFileSync(migrationPath, "utf8");
    const migration = raw.replace(/--[^\n]*/g, "");
    assert.match(migration, /pending_local_psp_payment[\s\S]*ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /pending_local_psp_payment[\s\S]*FORCE ROW LEVEL SECURITY/);
    assert.match(migration, /pending_zarinpal_payment[\s\S]*ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /pending_zarinpal_payment[\s\S]*FORCE ROW LEVEL SECURITY/);
    assert.match(migration, /pending_local_psp_dang_runtime/);
    assert.match(migration, /pending_zarinpal_dang_runtime/);
    assert.match(migration, /TO dang_runtime/);
    assert.match(migration, /app\.local_psp_intent_id/);
    assert.match(migration, /app\.zarinpal_authority/);
    assert.doesNotMatch(migration, /payee_user_id/);
    assert.doesNotMatch(migration, /ON DELETE RESTRICT/i);
  });

  it("is registered in the Drizzle migration journal", () => {
    const journal = readFileSync(
      resolve(process.cwd(), "migrations/meta/_journal.json"),
      "utf8",
    );
    assert.match(journal, /0098_pending_psp_rls/);
  });
});

describe("pending PSP RLS isolation (dang_runtime)", () => {
  it("allows capability GUC lookup and blocks cross-tenant select", async (t) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      t.skip(
        "DATABASE_URL not set — skip pending PSP RLS isolation (no .env load)",
      );
      return;
    }

    const { db, pool, close } = createDatabase(databaseUrl);
    t.after(async () => {
      await close();
    });

    const roleProbe = await pool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`
      select current_user, r.rolsuper, r.rolbypassrls
      from pg_roles r where r.rolname = current_user
    `);
    const probe = roleProbe.rows[0];
    if (!probe || probe.rolsuper || probe.rolbypassrls) {
      assert.fail(
        `pending PSP RLS test must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
      );
    }

    const rlsProbe = await pool.query<{ rls: boolean; force: boolean }>(`
      select c.relrowsecurity as rls, c.relforcerowsecurity as force
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'finance' and c.relname = 'pending_local_psp_payment'
    `);
    if (!rlsProbe.rows[0]?.rls || !rlsProbe.rows[0]?.force) {
      t.skip("pending_local_psp_payment RLS (0098) not applied yet");
      return;
    }

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const intentA = crypto.randomUUID();
    const intentB = crypto.randomUUID();
    const authorityA = `A${crypto.randomUUID().replaceAll("-", "").slice(0, 35)}`;

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `psp-rls-a-${userA}`,
        displayName: "PSP A",
      },
      {
        id: userB,
        externalSubject: `psp-rls-b-${userB}`,
        displayName: "PSP B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `psp-a-${workspaceA.slice(0, 8)}`,
        name: "PSP WS A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
      await tx.insert(pendingLocalPspPayment).values({
        intentId: intentA,
        amountMinor: 10000n,
        currency: "IRR",
        description: "a",
        returnUrl: "https://dang.local/a",
        workspaceId: workspaceA,
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      });
      await tx.insert(pendingZarinpalPayment).values({
        authority: authorityA,
        amountMinor: 20000n,
        workspaceId: workspaceA,
        status: "pending",
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `psp-b-${workspaceB.slice(0, 8)}`,
        name: "PSP WS B",
        template: "friends_family",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
      await tx.insert(pendingLocalPspPayment).values({
        intentId: intentB,
        amountMinor: 30000n,
        currency: "IRR",
        description: "b",
        returnUrl: "https://dang.local/b",
        workspaceId: workspaceB,
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      });
    });

    // Tenant B cannot see A's pending LocalPSP row
    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      const rows = await tx
        .select()
        .from(pendingLocalPspPayment)
        .where(eq(pendingLocalPspPayment.intentId, intentA));
      assert.equal(rows.length, 0);
    });

    // Capability GUC allows public checkout lookup without tenant session
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.local_psp_intent_id', ${intentA}, true)`,
      );
      const rows = await tx
        .select()
        .from(pendingLocalPspPayment)
        .where(eq(pendingLocalPspPayment.intentId, intentA));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.workspaceId, workspaceA);
    });

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.zarinpal_authority', ${authorityA}, true)`,
      );
      const rows = await tx
        .select()
        .from(pendingZarinpalPayment)
        .where(eq(pendingZarinpalPayment.authority, authorityA));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.workspaceId, workspaceA);
    });

    // Wrong capability GUC must not open another tenant's row
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.local_psp_intent_id', ${intentB}, true)`,
      );
      const rows = await tx
        .select()
        .from(pendingLocalPspPayment)
        .where(eq(pendingLocalPspPayment.intentId, intentA));
      assert.equal(rows.length, 0);
    });
  });
});
