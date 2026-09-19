import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  allocateEqualSplit,
  allocateItemizedSplit,
  buildMemberStatementDetail,
  evaluateAccessPolicy,
  statementZeroSumHolds,
  type AuthActor,
  type ExpenseSummary,
} from "@dang/contracts";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import type { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import type { IamStore } from "../iam/iam.types.js";
import { MemoryPayoutInstructionsStore } from "./memory-payout-instructions.store.js";
import { MemoryStatementsExportStore } from "./memory-statements-export.store.js";
import { StatementsService } from "./statements.service.js";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const financeUser = "33333333-3333-4333-8333-333333333333";

function actor(userId: string): AuthActor {
  return {
    userId,
    externalSubject: `sub-${userId.slice(0, 8)}`,
    displayName: userId.slice(0, 8),
    authMode: "password",
  };
}

function mockAccess(roleByUser: Record<string, string>): WorkspaceAccessService {
  return {
    requireMember: async () => undefined,
    requireMemberRole: async (_ws: string, userId: string) => {
      const role = roleByUser[userId];
      if (!role) throw new ForbiddenException({ status: 403 });
      return role as "owner" | "member" | "finance";
    },
    requireAnyRole: async (_ws: string, userId: string, allowed: readonly string[]) => {
      const role = roleByUser[userId];
      if (!role || !allowed.includes(role)) throw new ForbiddenException({ status: 403 });
      return role as "owner" | "member" | "finance";
    },
    requireFinanceManager: async (_ws: string, userId: string) => {
      const role = roleByUser[userId];
      if (role !== "finance" && role !== "owner" && role !== "admin") {
        throw new ForbiddenException({ status: 403 });
      }
      return role as "owner" | "admin" | "finance";
    },
    requireAccess: async (
      _ws: string,
      userId: string,
      action: string,
      resource?: { ownerUserId?: string },
    ) => {
      const role = roleByUser[userId];
      if (!role) throw new ForbiddenException({ status: 403 });
      const decision = evaluateAccessPolicy({
        role,
        action: action as never,
        subjectUserId: userId,
        resource,
      });
      if (!decision.allowed) throw new ForbiddenException({ status: 403 });
      return { role: role as "owner" | "member" | "finance", decision };
    },
    evaluate: (role: string, action: string, subjectUserId: string, resource?: { ownerUserId?: string }) =>
      evaluateAccessPolicy({
        role,
        action: action as never,
        subjectUserId,
        resource,
      }),
  } as unknown as WorkspaceAccessService;
}

function mockIam(): IamStore {
  return {
    persistence: "memory",
    listMembers: async () => [
      {
        workspaceId,
        userId: alice,
        displayName: "Alice",
        role: "member",
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      },
      {
        workspaceId,
        userId: bob,
        displayName: "Bob",
        role: "member",
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      },
      {
        workspaceId,
        userId: financeUser,
        displayName: "Finance",
        role: "finance",
        defaultShares: 1,
        joinedAt: new Date().toISOString(),
      },
    ],
    getWorkspaceForUser: async () => ({
      id: workspaceId,
      name: "WS",
      slug: "ws",
      template: "friends_family",
      role: "member",
    }),
  } as unknown as IamStore;
}

function mockNotifications() {
  return {
    notify: async () => ({
      id: "n1",
      workspaceId,
      userId: bob,
      channel: "in_app",
      title: "t",
      body: "b",
      createdAt: new Date().toISOString(),
    }),
  };
}

function mockAudit() {
  return {
    append: async (input: { action: string }) => ({
      id: "a1",
      ...input,
      occurredAt: new Date().toISOString(),
    }),
  };
}

function mockSecurityEvents() {
  return {
    emit: () => ({
      id: "se1",
      event: "privacy.data_exported",
      category: "privacy",
      severity: "info",
      occurredAt: new Date().toISOString(),
    }),
  };
}

function mockMailer() {
  return {
    mode: () => "dev-log" as const,
    isLiveDelivery: () => false,
    send: () => ({ delivered: false }),
  };
}

function mockAccounts() {
  return {
    findById: async () => null,
  };
}

function createService(
  expenses: MemoryExpenseStore,
  roleByUser: Record<string, string>,
  payout = new MemoryPayoutInstructionsStore(),
) {
  return new StatementsService(
    expenses,
    mockIam(),
    mockAccess(roleByUser),
    new MemoryStatementsExportStore(),
    payout,
    mockNotifications() as never,
    mockAudit() as never,
    mockSecurityEvents() as never,
    mockMailer() as never,
    mockAccounts() as never,
  );
}

function postedExpense(partial: Partial<ExpenseSummary> & Pick<ExpenseSummary, "id" | "title" | "total" | "paidByUserId" | "splitMethod" | "splits" | "occurredOn">): ExpenseSummary {
  return {
    workspaceId,
    status: "posted",
    visibility: "shared",
    participantUserIds: partial.splits.map((s) => s.userId),
    paymentLines: [
      { userId: partial.paidByUserId, amount: partial.total },
    ],
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

test("S11-08 zero-sum: statement share equals member expense shares", () => {
  const total = { amountMinor: "1000", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, [alice, bob]);
  const expense = postedExpense({
    id: "exp-equal-1",
    title: "نان",
    total,
    paidByUserId: alice,
    splitMethod: "equal",
    splits,
    occurredOn: "2026-09-01",
    catalogItemId: "cat-bread",
    unitCode: "piece",
    quantity: 2,
    unitPriceMinor: "500",
  });

  const detail = buildMemberStatementDetail({
    workspaceId,
    userId: alice,
    from: "2026-09-01",
    to: "2026-09-30",
    expenses: [expense],
  });

  assert.equal(detail.zeroSumOk, true);
  assert.ok(
    statementZeroSumHolds(
      [expense],
      alice,
      "2026-09-01",
      "2026-09-30",
      detail.lines,
    ),
  );
  assert.equal(detail.lines.length, 1);
  assert.equal(detail.lines[0]?.catalogItemId, "cat-bread");
  assert.equal(detail.lines[0]?.shareMinor, "500");
});

test("S11-08 zero-sum holds for itemized expenses with tip", () => {
  const items = [
    {
      title: "نوشابه",
      amount: { amountMinor: "300", currency: "IRR" as const },
      assigneeUserIds: [alice],
      catalogItemId: "cat-soda",
      unitCode: "piece",
      quantity: 1,
      unitPriceMinor: "300",
    },
    {
      title: "ماست",
      amount: { amountMinor: "200", currency: "IRR" as const },
      assigneeUserIds: [bob],
      catalogItemId: "cat-yogurt",
      unitCode: "pack",
      quantity: 1,
      unitPriceMinor: "200",
    },
  ];
  const tip = { amountMinor: "50", currency: "IRR" as const };
  const allocated = allocateItemizedSplit({ items, tip });
  const expense = postedExpense({
    id: "exp-item-1",
    title: "ناهار",
    total: allocated.total,
    tip,
    paidByUserId: alice,
    splitMethod: "itemized",
    splits: allocated.splits,
    items,
    occurredOn: "2026-09-05",
  });

  const aliceDetail = buildMemberStatementDetail({
    workspaceId,
    userId: alice,
    from: "2026-09-01",
    to: "2026-09-30",
    expenses: [expense],
  });
  const bobDetail = buildMemberStatementDetail({
    workspaceId,
    userId: bob,
    from: "2026-09-01",
    to: "2026-09-30",
    expenses: [expense],
  });

  assert.equal(aliceDetail.zeroSumOk, true);
  assert.equal(bobDetail.zeroSumOk, true);
  assert.ok(aliceDetail.lines.some((l) => l.itemName === "نوشابه"));
  assert.ok(bobDetail.lines.some((l) => l.itemName === "ماست"));
});

test("S11-08 member cannot read another member statement", async () => {
  const expenses = new MemoryExpenseStore();
  const service = createService(expenses, {
    [alice]: "member",
    [bob]: "member",
    [financeUser]: "finance",
  });

  await assert.rejects(
    () =>
      service.getDetail(actor(alice), workspaceId, bob, "2026-09-01", "2026-09-30"),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test("S11-08 finance can read any member and export CSV", async () => {
  const expenses = new MemoryExpenseStore();
  const draft = await expenses.createDraft(alice, {
    workspaceId,
    title: "نان مشترک",
    total: { amountMinor: "1000", currency: "IRR" },
    paidByUserId: alice,
    splitMethod: "equal",
    participantUserIds: [alice, bob],
    occurredOn: "2026-09-10",
    idempotencyKey: "stmt-test-1",
  });
  await expenses.post(workspaceId, draft.id, alice);

  const payout = new MemoryPayoutInstructionsStore();
  await payout.upsert(workspaceId, financeUser, {
    holderName: "علی",
    destinationKind: "card",
    destinationValue: "6393461063874330",
  });
  const service = createService(
    expenses,
    { [alice]: "member", [bob]: "member", [financeUser]: "finance" },
    payout,
  );

  const detail = await service.getDetail(
    actor(financeUser),
    workspaceId,
    alice,
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(detail.zeroSumOk, true);
  assert.ok(detail.lines.length >= 1);
  assert.equal(detail.payoutInstructions?.destinationValue, "6393461063874330");
  assert.ok(detail.payableMinor !== undefined);

  const created = await service.createExport(actor(financeUser), workspaceId, alice, {
    from: "2026-09-01",
    to: "2026-09-30",
    format: "csv",
  });
  assert.equal(created.status, "ready");
  assert.equal(created.format, "csv");
  assert.ok((created.rowCount ?? 0) >= 1);

  const file = await service.downloadPayload(actor(financeUser), workspaceId, created.id);
  assert.match(file.body, /shareMinor/);
  assert.match(file.body, /payableMinor=/);
  assert.match(file.body, /payout.destinationValue=/);
  assert.match(file.mimeType, /csv/);
});

test("S11-08 member can export own statement only", async () => {
  const expenses = new MemoryExpenseStore();
  const draft = await expenses.createDraft(alice, {
    workspaceId,
    title: "خرج",
    total: { amountMinor: "200", currency: "IRR" },
    paidByUserId: alice,
    splitMethod: "equal",
    participantUserIds: [alice, bob],
    occurredOn: "2026-09-12",
    idempotencyKey: "stmt-test-2",
  });
  await expenses.post(workspaceId, draft.id, alice);

  const service = createService(expenses, {
    [alice]: "member",
    [bob]: "member",
    [financeUser]: "finance",
  });

  const own = await service.createExport(actor(alice), workspaceId, alice, {
    from: "2026-09-01",
    to: "2026-09-30",
    format: "json",
  });
  assert.equal(own.format, "json");

  await assert.rejects(
    () =>
      service.createExport(actor(alice), workspaceId, bob, {
        from: "2026-09-01",
        to: "2026-09-30",
        format: "json",
      }),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test("payout instructions: member denied PUT; finance can notify", async () => {
  const expenses = new MemoryExpenseStore();
  const payout = new MemoryPayoutInstructionsStore();
  const service = createService(
    expenses,
    { [alice]: "member", [bob]: "member", [financeUser]: "finance" },
    payout,
  );

  await assert.rejects(
    () =>
      mockAccess({ [alice]: "member" }).requireAnyRole(workspaceId, alice, [
        "owner",
        "admin",
      ]),
    (err: unknown) => err instanceof ForbiddenException,
  );

  await assert.rejects(
    () =>
      service.notifyMember(actor(alice), workspaceId, bob, "2026-09-01", "2026-09-30"),
    (err: unknown) => err instanceof ForbiddenException,
  );

  const notified = await service.notifyMember(
    actor(financeUser),
    workspaceId,
    bob,
    "2026-09-01",
    "2026-09-30",
  );
  assert.equal(notified.notified, true);
  assert.match(notified.href, /\/w\/ws\/statements\//);
});
