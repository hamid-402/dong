import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";

function buildService(
  store: MemoryExpenseStore,
  policy: {
    requireReceiptAboveMinor: string | null;
    requireReceiptCategoryIds?: string[];
  },
) {
  return new ExpensesService(
    store,
    {
      persistence: "memory",
      get: async () => ({
        workspaceId: "w1",
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: policy.requireReceiptAboveMinor,
        requireReceiptCategoryIds: policy.requireReceiptCategoryIds ?? [],
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

test("receipt policy blocks submitting threshold expense without attachment", async () => {
  const previous = process.env.ENABLE_EXPENSE_POLICY;
  process.env.ENABLE_EXPENSE_POLICY = "1";
  try {
    const store = new MemoryExpenseStore();
    const draft = await store.createDraft("u1", {
      workspaceId: "w1",
      title: "Laptop",
      total: { amountMinor: "5000", currency: "IRR" },
      paidByUserId: "u1",
      splitMethod: "equal",
      participantUserIds: ["u1"],
      occurredOn: "2026-09-07",
      idempotencyKey: "e1",
    });
    const service = buildService(store, { requireReceiptAboveMinor: "5000" });
    await assert.rejects(
      service.submit(
        { userId: "u1", externalSubject: "u1", displayName: "U", authMode: "dev" },
        "w1",
        draft.id,
      ),
      (error: unknown) =>
        error instanceof BadRequestException && error.getResponse() !== undefined,
    );
  } finally {
    if (previous === undefined) delete process.env.ENABLE_EXPENSE_POLICY;
    else process.env.ENABLE_EXPENSE_POLICY = previous;
  }
});

test("G03 receipt policy blocks category-forced expense below amount threshold", async () => {
  const previous = process.env.ENABLE_EXPENSE_POLICY;
  process.env.ENABLE_EXPENSE_POLICY = "1";
  try {
    const store = new MemoryExpenseStore();
    const draft = await store.createDraft("u1", {
      workspaceId: "w1",
      title: "Taxi",
      total: { amountMinor: "100", currency: "IRR" },
      paidByUserId: "u1",
      splitMethod: "equal",
      participantUserIds: ["u1"],
      occurredOn: "2026-09-07",
      idempotencyKey: "e-cat",
      categoryId: "cat-travel",
    });
    const service = buildService(store, {
      requireReceiptAboveMinor: "999999",
      requireReceiptCategoryIds: ["cat-travel"],
    });
    await assert.rejects(
      service.submit(
        { userId: "u1", externalSubject: "u1", displayName: "U", authMode: "dev" },
        "w1",
        draft.id,
      ),
      (error: unknown) =>
        error instanceof BadRequestException && error.getResponse() !== undefined,
    );
  } finally {
    if (previous === undefined) delete process.env.ENABLE_EXPENSE_POLICY;
    else process.env.ENABLE_EXPENSE_POLICY = previous;
  }
});
