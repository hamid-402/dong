import assert from "node:assert/strict";
import test from "node:test";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";

test("expense approve returns pending tier progress without finalizing", async () => {
  const previousSteps = process.env.ENABLE_APPROVAL_STEPS;
  process.env.ENABLE_APPROVAL_STEPS = "0";
  try {
  const store = new MemoryExpenseStore();
  const draft = await store.createDraft("maker-1", {
    workspaceId: "w1",
    title: "Large buy",
    total: { amountMinor: "10000000", currency: "IRR" },
    paidByUserId: "maker-1",
    splitMethod: "equal",
    participantUserIds: ["maker-1"],
    occurredOn: "2026-09-07",
    requiresApproval: true,
    idempotencyKey: "tier-approve-1",
  });
  const submitted = await store.submit("w1", draft.id, "maker-1");

  let approveCalls = 0;
  const proxied = new Proxy(store, {
    get(target, prop, receiver) {
      if (prop === "approve") {
        return async (...args: unknown[]) => {
          approveCalls += 1;
          return (target.approve as (...a: unknown[]) => unknown)(...args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const service = new ExpensesService(
    proxied as never,
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
      getWorkspaceForUser: async () => ({ template: "small_team" }),
      listMembers: async () => [
        { userId: "checker-1", role: "finance" },
        { userId: "maker-1", role: "member" },
      ],
    } as never,
    {
      requireAccess: async () => ({
        role: "finance",
        decision: { allowed: true },
      }),
      requireMemberRole: async () => "finance",
      assertNotReadOnly: () => {},
    } as never,
    { append: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { listForTarget: async () => [] } as never,
    {
      createFirst: async () => null,
      approve: async () => {},
      pending: async () => [],
    } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({
        outcome: "pending",
        evaluation: {
          tier: { minAmountMinor: "10000000", requiredApprovals: 2 },
          allowed: true,
          status: "pending",
          approvalsCount: 1,
          requiredApprovals: 2,
        },
      }),
      withTierProgress: <T extends object>(
        summary: T,
        evaluation: {
          approvalsCount: number;
          requiredApprovals: number;
          status: "pending" | "complete" | "rejected";
        },
      ) => ({
        ...summary,
        approvalsHave: evaluation.approvalsCount,
        approvalsNeeded: evaluation.requiredApprovals,
        tierApprovalStatus: evaluation.status,
      }),
    } as never,
    { recordUsage: async () => undefined } as never,
  );

  const result = await service.approve(
    {
      userId: "checker-1",
      externalSubject: "checker-1",
      displayName: "Checker",
      authMode: "dev",
    },
    "w1",
    submitted.id,
  );

  assert.equal(approveCalls, 0);
  assert.equal(result.status, "submitted");
  assert.equal(result.tierApprovalStatus, "pending");
  assert.equal(result.approvalsHave, 1);
  assert.equal(result.approvalsNeeded, 2);

  const still = await store.get("w1", submitted.id, "checker-1");
  assert.equal(still?.status, "submitted");
  assert.equal(still?.approvedByUserId, undefined);
  } finally {
    if (previousSteps === undefined) delete process.env.ENABLE_APPROVAL_STEPS;
    else process.env.ENABLE_APPROVAL_STEPS = previousSteps;
  }
});
