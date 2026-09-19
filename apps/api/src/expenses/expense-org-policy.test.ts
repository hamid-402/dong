import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePerDiemRequiresApproval } from "./expense-org-policy.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";

test("evaluatePerDiemRequiresApproval when daily total would exceed cap", () => {
  assert.equal(
    evaluatePerDiemRequiresApproval({
      perDiemDailyMinor: "50000",
      actorUserId: "u1",
      occurredOn: "2026-09-07",
      addedMinor: "20000",
      expenses: [
        {
          id: "e0",
          workspaceId: "w1",
          title: "Breakfast",
          status: "posted",
          visibility: "shared",
          total: { amountMinor: "40000", currency: "IRR" },
          paidByUserId: "u1",
          paymentLines: [],
          splitMethod: "equal",
          participantUserIds: ["u1"],
          splits: [],
          occurredOn: "2026-09-07",
          createdAt: "2026-09-07T00:00:00.000Z",
        },
      ],
    }),
    true,
  );
});

test("missionKind forces company visibility on createDraft", async () => {
  const store = new MemoryExpenseStore();
  const service = new ExpensesService(
    store,
    {
      persistence: "memory",
      get: async () => ({
        workspaceId: "w1",
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
      }),
      put: async () => {
        throw new Error();
      },
    },
    {} as never,
    {
      getWorkspaceForUser: async () => ({ template: "friends_family" }),
      listMembers: async () => [{ userId: "u1", role: "member" }],
    } as never,
    {
      requireAccess: async () => ({
        role: "member",
        decision: { allowed: true },
      }),
      assertNotReadOnly: () => {},
    } as never,
    { append: async () => undefined } as never,
    {} as never,
    {
      run: async (_scope: string, _user: string, _key: string, fn: () => Promise<unknown>) =>
        fn(),
    } as never,
    {} as never,
    {} as never,
    { listForTarget: async () => [] } as never,
    { createFirst: async () => null, approve: async () => {}, pending: async () => [] } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { recordUsage: async () => undefined } as never,
  );
  const created = await service.createDraft(
    { userId: "u1", externalSubject: "u1", displayName: "U", authMode: "dev" },
    "w1",
    {
      title: "Trip advance",
      total: { amountMinor: "1000", currency: "IRR" },
      paidByUserId: "u1",
      splitMethod: "equal",
      participantUserIds: ["u1"],
      occurredOn: "2026-09-07",
      idempotencyKey: "mission-1",
      missionKind: "advance",
      visibility: "private",
    },
  );
  assert.equal(created.visibility, "company");
  assert.equal(created.missionKind, "advance");
});
