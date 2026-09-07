import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalQueueService } from "./approval-queue.service.js";

test("approval queue returns an honest empty array", async () => {
  const previous = process.env.ENABLE_APPROVAL_QUEUE;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  try {
    const service = new ApprovalQueueService(
      { list: async () => [] } as never,
      { listPendingApprovals: async () => [] } as never,
      { listForWorkspace: async () => [] } as never,
      { requireMemberRole: async () => "member" } as never,
      { pending: async () => [] } as never,
    );
    const items = await service.list(
      {
        userId: "member-1",
        externalSubject: "member-1",
        displayName: "Member",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.deepEqual(items, []);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_APPROVAL_QUEUE;
    else process.env.ENABLE_APPROVAL_QUEUE = previous;
  }
});

test("approval queue only exposes add-on acknowledgement to its target member", async () => {
  const previousQueue = process.env.ENABLE_APPROVAL_QUEUE;
  const previousAddon = process.env.ENABLE_ADDON_ACK;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  process.env.ENABLE_ADDON_ACK = "1";
  try {
    const service = new ApprovalQueueService(
      {
        list: async () => [
          {
            id: "charge-1",
            workspaceId: "workspace-1",
            targetMemberUserId: "target-1",
            createdByUserId: "creator-1",
            title: "هزینه شخصی",
            amount: { amountMinor: "1000", currency: "IRR" },
            status: "pending_ack",
            createdAt: "2026-09-07T12:00:00.000Z",
          },
        ],
      } as never,
      { listPendingApprovals: async () => [] } as never,
      { listForWorkspace: async () => [] } as never,
      { requireMemberRole: async () => "finance" } as never,
      { pending: async () => [] } as never,
    );

    const items = await service.list(
      {
        userId: "creator-1",
        externalSubject: "creator-1",
        displayName: "Creator",
        authMode: "dev",
      },
      "workspace-1",
    );

    assert.deepEqual(items, []);
  } finally {
    if (previousQueue === undefined) delete process.env.ENABLE_APPROVAL_QUEUE;
    else process.env.ENABLE_APPROVAL_QUEUE = previousQueue;
    if (previousAddon === undefined) delete process.env.ENABLE_ADDON_ACK;
    else process.env.ENABLE_ADDON_ACK = previousAddon;
  }
});

test("approval steps produce one actionable expense row without a generic duplicate", async () => {
  const previousQueue = process.env.ENABLE_APPROVAL_QUEUE;
  const previousSteps = process.env.ENABLE_APPROVAL_STEPS;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  process.env.ENABLE_APPROVAL_STEPS = "1";
  try {
    const expense = {
      id: "expense-1",
      title: "خرید دفتر",
      total: { amountMinor: "2500", currency: "IRR" },
      requiresApproval: true,
      status: "submitted",
      createdAt: "2026-09-07T12:00:00.000Z",
    };
    const service = new ApprovalQueueService(
      { list: async () => [] } as never,
      { listPendingApprovals: async () => [] } as never,
      { listForWorkspace: async () => [expense] } as never,
      { requireMemberRole: async () => "approver" } as never,
      {
        pending: async () => [
          {
            expenseId: expense.id,
            stepNo: 1,
            createdAt: expense.createdAt,
          },
        ],
      } as never,
    );

    const items = await service.list(
      {
        userId: "approver-1",
        externalSubject: "approver-1",
        displayName: "Approver",
        authMode: "dev",
      },
      "workspace-1",
    );

    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, expense.id);
    assert.equal(items[0]?.status, "step_1_pending");
  } finally {
    if (previousQueue === undefined) delete process.env.ENABLE_APPROVAL_QUEUE;
    else process.env.ENABLE_APPROVAL_QUEUE = previousQueue;
    if (previousSteps === undefined) delete process.env.ENABLE_APPROVAL_STEPS;
    else process.env.ENABLE_APPROVAL_STEPS = previousSteps;
  }
});
