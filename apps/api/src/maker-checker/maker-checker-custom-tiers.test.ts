import assert from "node:assert/strict";
import test from "node:test";
import { MemoryApprovalDecisionStore } from "./memory-approval-decision.store.js";
import { MakerCheckerService } from "./maker-checker.service.js";
import type { ExpensePolicyStore } from "../expense-policy/expense-policy.types.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const maker = "22222222-2222-4222-8222-222222222222";
const a1 = "55555555-5555-4555-8555-555555555555";
const a2 = "66666666-6666-4666-8666-666666666666";

test("custom workspace tiers require two distinct approvals", async () => {
  const prev = process.env.ENABLE_EXPENSE_POLICY;
  process.env.ENABLE_EXPENSE_POLICY = "1";
  try {
    const policies: ExpensePolicyStore = {
      persistence: "memory",
      get: async () => ({
        workspaceId,
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
        approvalTiers: [
          { minAmountMinor: "0", requiredApprovals: 2 },
        ],
      }),
      put: async () => {
        throw new Error();
      },
    };
    const decisions = new MemoryApprovalDecisionStore();
    const svc = new MakerCheckerService(policies, undefined, decisions);
    const tiers = await svc.resolveApprovalTiersForWorkspace(workspaceId, maker);
    assert.equal(tiers.length, 1);
    assert.equal(tiers[0]?.requiredApprovals, 2);

    const first = await svc.applyTierGate({
      workspaceId,
      requestType: "expense",
      requestId: "exp-1",
      amountMinor: "1000",
      makerUserId: maker,
      approverUserId: a1,
      approverRoles: ["finance"],
      tiers,
    });
    assert.equal(first.outcome, "pending");

    const second = await svc.applyTierGate({
      workspaceId,
      requestType: "expense",
      requestId: "exp-1",
      amountMinor: "1000",
      makerUserId: maker,
      approverUserId: a2,
      approverRoles: ["finance"],
      tiers,
    });
    assert.equal(second.outcome, "finalize");
  } finally {
    if (prev === undefined) delete process.env.ENABLE_EXPENSE_POLICY;
    else process.env.ENABLE_EXPENSE_POLICY = prev;
  }
});
