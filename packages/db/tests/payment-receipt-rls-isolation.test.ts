/**
 * payment_receipt RLS isolation across two workspaces (migration 0052+).
 *
 * Skips when DATABASE_URL is unset. Requires NOBYPASSRLS runtime role.
 * Does not read .env — set DATABASE_URL in the process environment to run.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDatabase,
  eq,
  membership,
  paymentReceipt,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const databaseUrl = process.env.DATABASE_URL;

describe("payment_receipt RLS isolation", () => {
  it("keeps select/update of receipts private across workspaces", async (t) => {
    if (!databaseUrl) {
      t.skip(
        "DATABASE_URL not set — skip payment_receipt RLS isolation (no .env load)",
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
        `payment_receipt RLS test must run as NOBYPASSRLS (got ${probe?.current_user ?? "?"}); use dang_runtime`,
      );
    }

    const rlsProbe = await pool.query<{ rls: boolean; force: boolean }>(`
      select c.relrowsecurity as rls, c.relforcerowsecurity as force
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'finance' and c.relname = 'payment_receipt'
    `);
    if (!rlsProbe.rows[0]?.rls || !rlsProbe.rows[0]?.force) {
      t.skip("payment_receipt RLS (0052) not applied yet");
      return;
    }

    const payeeCol = await pool.query<{ exists: boolean }>(`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'finance'
          and table_name = 'payment_receipt'
          and column_name = 'payee_user_id'
      ) as exists
    `);
    const hasPayeeCol = Boolean(payeeCol.rows[0]?.exists);

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const receiptId = crypto.randomUUID();

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `rcpt-rls-a-${userA}`,
        displayName: "Receipt A",
      },
      {
        id: userB,
        externalSubject: `rcpt-rls-b-${userB}`,
        displayName: "Receipt B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `rcpt-a-${workspaceA.slice(0, 8)}`,
        name: "Receipt WS A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });
      await tx.insert(paymentReceipt).values({
        id: receiptId,
        workspaceId: workspaceA,
        payerUserId: userA,
        ...(hasPayeeCol ? { payeeUserId: userA } : {}),
        method: "cash",
        amountMinor: 10000n,
        paidAt: new Date(),
        idempotencyKey: `rcpt-rls-${receiptId}`,
      });
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `rcpt-b-${workspaceB.slice(0, 8)}`,
        name: "Receipt WS B",
        template: "friends_family",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
    });

    const bSees = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx.select().from(paymentReceipt).where(eq(paymentReceipt.id, receiptId)),
    );
    assert.equal(bSees.length, 0, "workspace B must not SELECT A's payment_receipt");

    const bUpdate = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx
          .update(paymentReceipt)
          .set({ reviewNote: "cross-tenant" })
          .where(eq(paymentReceipt.id, receiptId))
          .returning(),
    );
    assert.equal(bUpdate.length, 0, "workspace B must not UPDATE A's payment_receipt");

    const aSees = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.select().from(paymentReceipt).where(eq(paymentReceipt.id, receiptId)),
    );
    assert.equal(aSees.length, 1, "workspace A still sees its own receipt");
  });
});
