/**
 * DB checks for migration 0105 â€” expense DELETE only for draft/reversed.
 * Uses process.env.DATABASE_URL only (skip if unset). Never logs the URL.
 * Requires current_user = dang_runtime already (no SET ROLE, no .env read).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDatabase,
  eq,
  expense,
  expensePaymentLine,
  expenseSplitLine,
  membership,
  userAccount,
  withTenantContext,
  workspace,
} from "../src/index.ts";

const databaseUrl = process.env.DATABASE_URL?.trim();

describe("0105 expense delete status guard (dang_runtime)", () => {
  it("blocks posted deletes; allows draft/reversed; rejects other workspace", async (t) => {
    if (!databaseUrl) {
      t.skip("DATABASE_URL unset");
      return;
    }
    if (/:5437(?:\/|\?|$)/.test(databaseUrl)) {
      assert.fail("port 5437 refused");
    }

    const { db, pool, close } = createDatabase(databaseUrl);

    const roleProbe = await pool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`
      select current_user, r.rolsuper, r.rolbypassrls
      from pg_roles r where r.rolname = current_user
    `);
    const probe = roleProbe.rows[0];
    if (!probe || probe.current_user !== "dang_runtime") {
      assert.fail(
        `session must already be dang_runtime (got ${probe?.current_user ?? "?"}); no SET ROLE`,
      );
    }
    if (probe.rolsuper || probe.rolbypassrls) {
      assert.fail(
        `dang_runtime must be NOBYPASSRLS / not superuser (super=${probe.rolsuper}, bypass=${probe.rolbypassrls})`,
      );
    }

    const policyProbe = await pool.query<{ policyname: string; qual: string }>(`
      select policyname, qual
      from pg_policies
      where schemaname = 'finance'
        and policyname = 'expense_tenant_delete'
    `);
    const qual = policyProbe.rows[0]?.qual ?? "";
    if (!/status/i.test(qual) || !/draft/i.test(qual) || !/reversed/i.test(qual)) {
      t.skip("0105 expense_tenant_delete status guard not applied yet");
      return;
    }

    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const workspaceA = crypto.randomUUID();
    const workspaceB = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const postedId = crypto.randomUUID();
    const reversedId = crypto.randomUUID();
    const otherWsExpenseId = crypto.randomUUID();

    const createdUserIds = [userA, userB];
    const createdWorkspaceIds = [workspaceA, workspaceB];
    const createdExpenseIds = [draftId, postedId, reversedId, otherWsExpenseId];

    t.after(async () => {
      try {
        // dang_runtime has DELETE on expense* only (not membership/workspace/user_account).
        await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
          for (const id of [draftId, postedId, reversedId]) {
            await tx.delete(expensePaymentLine).where(eq(expensePaymentLine.expenseId, id));
            await tx.delete(expenseSplitLine).where(eq(expenseSplitLine.expenseId, id));
            await tx.update(expense).set({ status: "draft" }).where(eq(expense.id, id));
            await tx.delete(expense).where(eq(expense.id, id));
          }
        });
        await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
          await tx
            .delete(expensePaymentLine)
            .where(eq(expensePaymentLine.expenseId, otherWsExpenseId));
          await tx
            .delete(expenseSplitLine)
            .where(eq(expenseSplitLine.expenseId, otherWsExpenseId));
          await tx
            .update(expense)
            .set({ status: "draft" })
            .where(eq(expense.id, otherWsExpenseId));
          await tx.delete(expense).where(eq(expense.id, otherWsExpenseId));
        });
      } catch {
        // best-effort cleanup; do not fail the assertion result
      } finally {
        await close();
      }
    });

    await db.insert(userAccount).values([
      {
        id: userA,
        externalSubject: `exp-del-a-${userA}`,
        displayName: "Expense Delete A",
      },
      {
        id: userB,
        externalSubject: `exp-del-b-${userB}`,
        displayName: "Expense Delete B",
      },
    ]);

    await withTenantContext(db, { workspaceId: workspaceA, userId: userA }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceA,
        slug: `exp-del-a-${workspaceA.slice(0, 8)}`,
        name: "Expense Delete WS A",
        template: "friends_family",
        createdBy: userA,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceA,
        userId: userA,
        role: "owner",
      });

      await tx.insert(expense).values([
        {
          id: draftId,
          workspaceId: workspaceA,
          title: "Draft purge target",
          status: "draft",
          totalMinor: 1_000n,
          paidByUserId: userA,
          splitMethod: "equal",
          occurredOn: "2026-11-04",
          idempotencyKey: `draft-${draftId.slice(0, 8)}`,
          createdByUserId: userA,
        },
        {
          id: postedId,
          workspaceId: workspaceA,
          title: "Posted purge blocked",
          status: "posted",
          totalMinor: 2_000n,
          paidByUserId: userA,
          splitMethod: "equal",
          occurredOn: "2026-11-04",
          idempotencyKey: `posted-${postedId.slice(0, 8)}`,
          createdByUserId: userA,
        },
        {
          id: reversedId,
          workspaceId: workspaceA,
          title: "Reversed purge target",
          status: "reversed",
          totalMinor: 3_000n,
          paidByUserId: userA,
          splitMethod: "equal",
          occurredOn: "2026-11-04",
          idempotencyKey: `rev-${reversedId.slice(0, 8)}`,
          createdByUserId: userA,
        },
      ]);

      await tx.insert(expenseSplitLine).values([
        {
          expenseId: draftId,
          workspaceId: workspaceA,
          userId: userA,
          amountMinor: 1_000n,
          lineNo: 1,
        },
        {
          expenseId: postedId,
          workspaceId: workspaceA,
          userId: userA,
          amountMinor: 2_000n,
          lineNo: 1,
        },
        {
          expenseId: reversedId,
          workspaceId: workspaceA,
          userId: userA,
          amountMinor: 3_000n,
          lineNo: 1,
        },
      ]);

      await tx.insert(expensePaymentLine).values([
        {
          expenseId: draftId,
          workspaceId: workspaceA,
          userId: userA,
          amountMinor: 1_000n,
          lineNo: 1,
        },
        {
          expenseId: postedId,
          workspaceId: workspaceA,
          userId: userA,
          amountMinor: 2_000n,
          lineNo: 1,
        },
        {
          expenseId: reversedId,
          workspaceId: workspaceA,
          userId: userA,
          amountMinor: 3_000n,
          lineNo: 1,
        },
      ]);
    });

    await withTenantContext(db, { workspaceId: workspaceB, userId: userB }, async (tx) => {
      await tx.insert(workspace).values({
        id: workspaceB,
        slug: `exp-del-b-${workspaceB.slice(0, 8)}`,
        name: "Expense Delete WS B",
        template: "small_team",
        createdBy: userB,
      });
      await tx.insert(membership).values({
        workspaceId: workspaceB,
        userId: userB,
        role: "owner",
      });
      await tx.insert(expense).values({
        id: otherWsExpenseId,
        workspaceId: workspaceB,
        title: "Other workspace draft",
        status: "draft",
        totalMinor: 500n,
        paidByUserId: userB,
        splitMethod: "equal",
        occurredOn: "2026-11-04",
        idempotencyKey: `other-${otherWsExpenseId.slice(0, 8)}`,
        createdByUserId: userB,
      });
    });

    const postedDeleted = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) => tx.delete(expense).where(eq(expense.id, postedId)).returning({ id: expense.id }),
    );
    assert.equal(postedDeleted.length, 0, "posted expense DELETE must be rejected (0 rows)");

    const postedStill = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) => tx.select({ id: expense.id }).from(expense).where(eq(expense.id, postedId)),
    );
    assert.equal(postedStill.length, 1);

    const draftDeleted = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) => tx.delete(expense).where(eq(expense.id, draftId)).returning({ id: expense.id }),
    );
    assert.equal(draftDeleted.length, 1, "draft expense DELETE must succeed");

    const reversedDeleted = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx.delete(expense).where(eq(expense.id, reversedId)).returning({ id: expense.id }),
    );
    assert.equal(reversedDeleted.length, 1, "reversed expense DELETE must succeed");

    const crossDeleted = await withTenantContext(
      db,
      { workspaceId: workspaceA, userId: userA },
      async (tx) =>
        tx
          .delete(expense)
          .where(eq(expense.id, otherWsExpenseId))
          .returning({ id: expense.id }),
    );
    assert.equal(crossDeleted.length, 0, "other-workspace DELETE must be rejected");

    const otherStill = await withTenantContext(
      db,
      { workspaceId: workspaceB, userId: userB },
      async (tx) =>
        tx.select({ id: expense.id }).from(expense).where(eq(expense.id, otherWsExpenseId)),
    );
    assert.equal(otherStill.length, 1);
  });
});
