import assert from "node:assert/strict";
import test from "node:test";
import { MemoryOutingStore } from "../expenses/outing.store.js";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { ExpensesService } from "../expenses/expenses.service.js";

test("G04 outing budget cap blocks over-budget expense", async () => {
  const outings = new MemoryOutingStore();
  const outing = await outings.create("ws1", "alice", {
    title: "سفر شمال",
    occurredOn: "2026-09-19",
    budgetCapMinor: "100000",
    startsOn: "2026-09-19",
    endsOn: "2026-09-21",
    idempotencyKey: "out-1",
  });
  assert.equal(outing.budgetCapMinor, "100000");

  const expenses = new MemoryExpenseStore();
  const service = new ExpensesService(
    expenses,
    {} as never,
    {} as never,
    {
      getWorkspaceForUser: async () => ({ template: "friends_family" }),
      listMembers: async () => [{ userId: "alice", role: "owner" }],
    } as never,
    {
      requireAccess: async () => ({ role: "owner", decision: { allowed: true } }),
      requireMemberRole: async () => "owner",
      assertNotReadOnly: () => {},
    } as never,
    { append: async () => undefined } as never,
    {} as never,
    {
      run: async (_ns: string, _u: string, _k: string, fn: () => Promise<unknown>) => fn(),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
      resolveThresholdMinor: async () => null,
    } as never,
    { recordUsage: async () => undefined } as never,
    undefined,
    outings,
  );

  await assert.rejects(
    () =>
      service.createDraft(
        {
          userId: "alice",
          externalSubject: "alice",
          displayName: "Alice",
          authMode: "dev",
        },
        "ws1",
        {
          workspaceId: "ws1",
          title: "هتل",
          total: { amountMinor: "150000", currency: "IRR" },
          paidByUserId: "alice",
          splitMethod: "equal",
          participantUserIds: ["alice"],
          occurredOn: "2026-09-19",
          outingId: outing.id,
          idempotencyKey: "over-budget",
        },
      ),
    (err: unknown) =>
      err instanceof Error ||
      (typeof err === "object" && err !== null && "getResponse" in err),
  );
});
