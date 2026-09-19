import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";

function buildService(
  store: MemoryExpenseStore,
  policy: { requireCostCenter: boolean },
) {
  return new ExpensesService(
    store,
    {
      persistence: "memory",
      get: async () => ({
        workspaceId: "w1",
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
        requireReceiptCategoryIds: [],
        requireCostCenter: policy.requireCostCenter,
      }),
      put: async () => {
        throw new Error();
      },
    },
    {} as never,
    {
      getWorkspaceForUser: async () => ({ template: "small_team" }),
      listMembers: async () => [{ userId: "u1", role: "owner" }],
    } as never,
    {
      requireMemberRole: async () => "owner",
      requireAccess: async () => ({
        role: "owner",
        decision: { allowed: true },
      }),
      assertNotReadOnly: () => {},
    } as never,
    {} as never,
    {} as never,
    {} as never,
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
}

test("requireCostCenter rejects createDraft without costCenterId on org workspace", async () => {
  const previous = process.env.ENABLE_EXPENSE_POLICY;
  process.env.ENABLE_EXPENSE_POLICY = "1";
  try {
    const store = new MemoryExpenseStore();
    const service = buildService(store, { requireCostCenter: true });
    await assert.rejects(
      () =>
        service.createDraft(
          { userId: "u1", externalSubject: "u1", displayName: "U", authMode: "dev" },
          "w1",
          {
            title: "Office",
            total: { amountMinor: "1000", currency: "IRR" },
            paidByUserId: "u1",
            splitMethod: "equal",
            participantUserIds: ["u1"],
            occurredOn: "2026-09-07",
            idempotencyKey: "cc-1",
            visibility: "company",
          },
        ),
      (error: unknown) => {
        if (!(error instanceof BadRequestException)) return false;
        const body = error.getResponse() as { title?: string };
        return body.title === "COST_CENTER_REQUIRED";
      },
    );
  } finally {
    if (previous === undefined) delete process.env.ENABLE_EXPENSE_POLICY;
    else process.env.ENABLE_EXPENSE_POLICY = previous;
  }
});

test("requireCostCenter blocks submit when draft lacks cost center", async () => {
  const previous = process.env.ENABLE_EXPENSE_POLICY;
  process.env.ENABLE_EXPENSE_POLICY = "1";
  try {
    const store = new MemoryExpenseStore();
    const draft = await store.createDraft("u1", {
      workspaceId: "w1",
      title: "Office",
      total: { amountMinor: "1000", currency: "IRR" },
      paidByUserId: "u1",
      splitMethod: "equal",
      participantUserIds: ["u1"],
      occurredOn: "2026-09-07",
      idempotencyKey: "cc-2",
      visibility: "shared",
    });
    const service = buildService(store, { requireCostCenter: true });
    await assert.rejects(
      () =>
        service.submit(
          { userId: "u1", externalSubject: "u1", displayName: "U", authMode: "dev" },
          "w1",
          draft.id,
        ),
      (error: unknown) => error instanceof BadRequestException,
    );
  } finally {
    if (previous === undefined) delete process.env.ENABLE_EXPENSE_POLICY;
    else process.env.ENABLE_EXPENSE_POLICY = previous;
  }
});
