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
