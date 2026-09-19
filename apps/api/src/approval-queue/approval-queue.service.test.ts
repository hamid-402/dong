import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalQueueService } from "./approval-queue.service.js";

function stubs(overrides?: {
  settlements?: unknown;
  makerChecker?: unknown;
  role?: string;
  expenses?: unknown;
  steps?: unknown;
  addons?: unknown;
}) {
  return {
    addons: (overrides?.addons ?? { list: async () => [] }) as never,
    billing: { listPendingApprovals: async () => [] } as never,
    expenses: (overrides?.expenses ?? {
      listForWorkspace: async () => [],
    }) as never,
    settlements: (overrides?.settlements ?? {
      listForWorkspace: async () => [],
    }) as never,
    access: {
      requireMemberRole: async () => overrides?.role ?? "member",
    } as never,
    steps: (overrides?.steps ?? { pending: async () => [] }) as never,
    makerChecker: (overrides?.makerChecker ?? {
      enabled: () => false,
      resolveThresholdMinor: async () => null,
      approvalProgress: async () => ({
        approvalsHave: 0,
        approvalsNeeded: 1,
        tier: { minAmountMinor: "0", requiredApprovals: 1 },
      }),
    }) as never,
  };
}

function serviceFrom(parts: ReturnType<typeof stubs>) {
  return new ApprovalQueueService(
    parts.addons,
    parts.billing,
    parts.expenses,
    parts.settlements,
    parts.access,
    parts.steps,
    parts.makerChecker,
  );
}

test("approval queue returns an honest empty array", async () => {
  const previous = process.env.ENABLE_APPROVAL_QUEUE;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  try {
    const items = await serviceFrom(stubs()).list(
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

test("approval queue count matches list length for empty queue", async () => {
  const previous = process.env.ENABLE_APPROVAL_QUEUE;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  try {
    const svc = serviceFrom(stubs());
    const actor = {
      userId: "member-1",
      externalSubject: "member-1",
      displayName: "Member",
      authMode: "dev" as const,
    };
    const items = await svc.list(actor, "workspace-1");
    const counted = await svc.count(actor, "workspace-1");
    assert.equal(counted.count, items.length);
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
    const parts = stubs({
      role: "finance",
      addons: {
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
      },
    });
    const items = await serviceFrom(parts).list(
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
      createdByUserId: "maker-1",
    };
    const parts = stubs({
      role: "approver",
      expenses: { listForWorkspace: async () => [expense] },
      steps: {
        pending: async () => [
          {
            expenseId: expense.id,
            stepNo: 1,
            createdAt: expense.createdAt,
          },
        ],
      },
    });

    const items = await serviceFrom(parts).list(
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

test("maker-checker surfaces claimed settlements above threshold for checker only", async () => {
  const previousQueue = process.env.ENABLE_APPROVAL_QUEUE;
  const previousMc = process.env.ENABLE_MAKER_CHECKER;
  const previousThreshold = process.env.MAKER_CHECKER_THRESHOLD_MINOR;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  process.env.ENABLE_MAKER_CHECKER = "1";
  process.env.MAKER_CHECKER_THRESHOLD_MINOR = "1000";
  try {
    const settlement = {
      id: "stl-1",
      workspaceId: "workspace-1",
      fromUserId: "debtor-1",
      toUserId: "creditor-1",
      amount: { amountMinor: "5000", currency: "IRR" },
      status: "claimed",
      createdAt: "2026-09-07T12:00:00.000Z",
      createdByUserId: "debtor-1",
    };
    const parts = stubs({
      role: "member",
      settlements: { listForWorkspace: async () => [settlement] },
      makerChecker: {
        enabled: () => true,
        resolveThresholdMinor: async () => "1000",
        approvalProgress: async () => ({
          approvalsHave: 1,
          approvalsNeeded: 2,
          tier: { minAmountMinor: "10000000", requiredApprovals: 2 },
        }),
      },
    });

    const forCreditor = await serviceFrom(parts).list(
      {
        userId: "creditor-1",
        externalSubject: "creditor-1",
        displayName: "Creditor",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.equal(forCreditor.length, 1);
    assert.equal(forCreditor[0]?.kind, "settlement");
    assert.equal(forCreditor[0]?.status, "claimed_four_eyes");
    assert.equal(forCreditor[0]?.approvalsHave, 1);
    assert.equal(forCreditor[0]?.approvalsNeeded, 2);

    const forMaker = await serviceFrom(parts).list(
      {
        userId: "debtor-1",
        externalSubject: "debtor-1",
        displayName: "Debtor",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.deepEqual(forMaker, []);

    const below = stubs({
      role: "member",
      settlements: {
        listForWorkspace: async () => [
          { ...settlement, amount: { amountMinor: "100", currency: "IRR" } },
        ],
      },
      makerChecker: {
        enabled: () => true,
        resolveThresholdMinor: async () => "1000",
        approvalProgress: async () => ({
          approvalsHave: 0,
          approvalsNeeded: 1,
          tier: { minAmountMinor: "0", requiredApprovals: 1 },
        }),
      },
    });
    const belowItems = await serviceFrom(below).list(
      {
        userId: "creditor-1",
        externalSubject: "creditor-1",
        displayName: "Creditor",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.deepEqual(belowItems, []);
  } finally {
    if (previousQueue === undefined) delete process.env.ENABLE_APPROVAL_QUEUE;
    else process.env.ENABLE_APPROVAL_QUEUE = previousQueue;
    if (previousMc === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = previousMc;
    if (previousThreshold === undefined) {
      delete process.env.MAKER_CHECKER_THRESHOLD_MINOR;
    } else {
      process.env.MAKER_CHECKER_THRESHOLD_MINOR = previousThreshold;
    }
  }
});

test("maker-checker omits high-value expense from maker's queue", async () => {
  const previousQueue = process.env.ENABLE_APPROVAL_QUEUE;
  const previousMc = process.env.ENABLE_MAKER_CHECKER;
  const previousSteps = process.env.ENABLE_APPROVAL_STEPS;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  process.env.ENABLE_MAKER_CHECKER = "1";
  process.env.ENABLE_APPROVAL_STEPS = "0";
  try {
    const expense = {
      id: "expense-1",
      title: "خرید بزرگ",
      total: { amountMinor: "5000", currency: "IRR" },
      requiresApproval: true,
      status: "submitted",
      createdAt: "2026-09-07T12:00:00.000Z",
      createdByUserId: "maker-1",
    };
    const expenses = { listForWorkspace: async () => [expense] };
    const makerChecker = {
      enabled: () => true,
      resolveThresholdMinor: async () => "1000",
      approvalProgress: async () => ({
        approvalsHave: 0,
        approvalsNeeded: 1,
        tier: { minAmountMinor: "0", requiredApprovals: 1 },
      }),
    };
    const access = { requireMemberRole: async () => "finance" };
    const svc = new ApprovalQueueService(
      { list: async () => [] } as never,
      { listPendingApprovals: async () => [] } as never,
      expenses as never,
      { listForWorkspace: async () => [] } as never,
      access as never,
      { pending: async () => [] } as never,
      makerChecker as never,
    );

    const forMaker = await svc.list(
      {
        userId: "maker-1",
        externalSubject: "maker-1",
        displayName: "Maker",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.deepEqual(forMaker, []);

    const forOther = await svc.list(
      {
        userId: "checker-1",
        externalSubject: "checker-1",
        displayName: "Checker",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.equal(forOther.length, 1, JSON.stringify(forOther));
    assert.equal(forOther[0]?.kind, "expense");
  } finally {
    if (previousQueue === undefined) delete process.env.ENABLE_APPROVAL_QUEUE;
    else process.env.ENABLE_APPROVAL_QUEUE = previousQueue;
    if (previousMc === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = previousMc;
    if (previousSteps === undefined) delete process.env.ENABLE_APPROVAL_STEPS;
    else process.env.ENABLE_APPROVAL_STEPS = previousSteps;
  }
});

test("approval queue attaches SLA breach from MAKER_CHECKER_SLA_HOURS", async () => {
  const previousQueue = process.env.ENABLE_APPROVAL_QUEUE;
  const previousAddon = process.env.ENABLE_ADDON_ACK;
  const previousSla = process.env.MAKER_CHECKER_SLA_HOURS;
  process.env.ENABLE_APPROVAL_QUEUE = "1";
  process.env.ENABLE_ADDON_ACK = "1";
  process.env.MAKER_CHECKER_SLA_HOURS = "24";
  try {
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const fresh = new Date().toISOString();
    const parts = stubs({
      role: "finance",
      addons: {
        list: async () => [
          {
            id: "charge-old",
            workspaceId: "workspace-1",
            targetMemberUserId: "member-1",
            createdByUserId: "creator-1",
            title: "قدیمی",
            amount: { amountMinor: "1000", currency: "IRR" },
            status: "pending_ack",
            createdAt: old,
          },
          {
            id: "charge-new",
            workspaceId: "workspace-1",
            targetMemberUserId: "member-1",
            createdByUserId: "creator-1",
            title: "تازه",
            amount: { amountMinor: "500", currency: "IRR" },
            status: "pending_ack",
            createdAt: fresh,
          },
        ],
      },
    });
    const items = await serviceFrom(parts).list(
      {
        userId: "member-1",
        externalSubject: "member-1",
        displayName: "Member",
        authMode: "dev",
      },
      "workspace-1",
    );
    assert.equal(items[0]?.id, "charge-old");
    assert.equal(items[0]?.slaBreached, true);
    assert.ok(items[0]?.slaDueAt);
    assert.equal(items[1]?.slaBreached, false);
  } finally {
    if (previousQueue === undefined) delete process.env.ENABLE_APPROVAL_QUEUE;
    else process.env.ENABLE_APPROVAL_QUEUE = previousQueue;
    if (previousAddon === undefined) delete process.env.ENABLE_ADDON_ACK;
    else process.env.ENABLE_ADDON_ACK = previousAddon;
    if (previousSla === undefined) delete process.env.MAKER_CHECKER_SLA_HOURS;
    else process.env.MAKER_CHECKER_SLA_HOURS = previousSla;
  }
});
