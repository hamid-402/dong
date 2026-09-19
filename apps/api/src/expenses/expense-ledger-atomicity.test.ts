/**
 * S10-14: mid-flight journal failure must not leave posted/confirmed without ledger.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor, ExpenseSummary } from "@dang/contracts";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import type { LedgerStore } from "../ledger/ledger.types.js";
import { MemorySettlementStore } from "../settlements/memory-settlement.store.js";
import { SettlementsService } from "../settlements/settlements.service.js";

const actor: AuthActor = {
  userId: "alice",
  externalSubject: "alice",
  displayName: "Alice",
  authMode: "dev",
};

const idempotency = {
  run: async (
    _scope: string,
    _actorUserId: string,
    _key: string,
    operation: () => Promise<unknown>,
  ) => operation(),
};

function failingLedger(inner: LedgerStore): LedgerStore {
  return {
    persistence: inner.persistence,
    db: inner.db,
    postExpense: async () => {
      throw new Error("LEDGER_INJECTED_FAILURE");
    },
    reverseExpense: async (...args) => inner.reverseExpense(...args),
    postSettlement: async () => {
      throw new Error("LEDGER_INJECTED_FAILURE");
    },
    postPaymentReceipt: async () => {
      throw new Error("LEDGER_INJECTED_FAILURE");
    },
    postOnBehalfPayment: async () => {
      throw new Error("LEDGER_INJECTED_FAILURE");
    },
    listForWorkspace: (...args) => inner.listForWorkspace(...args),
    balancesForWorkspace: (...args) => inner.balancesForWorkspace(...args),
  };
}

test("expense post rolls back status when journal fails (memory)", async () => {
  const expenses = new MemoryExpenseStore();
  const ledger = failingLedger(new MemoryLedgerStore());
  const draft = await expenses.createDraft("alice", {
    workspaceId: "ws1",
    title: "ناهار",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-09-01",
    idempotencyKey: "atom-1",
  });
  await expenses.submit("ws1", draft.id, "alice");

  const access = {
    requireMemberRole: async () => "owner",
    requireAccess: async () => ({
      role: "owner",
      decision: { allowed: true },
    }),
    assertNotReadOnly: () => undefined,
  };
  const iam = {
    getWorkspaceForUser: async () => ({ template: "friends" }),
    listMembers: async () => [{ userId: "alice", role: "owner" }],
  };
  const outbox = {
    insert: async (input: {
      workspaceId: string;
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }) => ({
      id: "outbox-1",
      ...input,
      createdAt: new Date().toISOString(),
      attempts: 0,
    }),
  };
  const relay = {
    correlation: () => ({}),
    dispatch: async () => undefined,
  };
  const service = new ExpensesService(
    expenses,
    {
      get: async () => ({
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
      }),
    } as never,
    ledger,
    iam as never,
    access as never,
    { append: async () => undefined } as never,
    { applyCompanyExpenseSpend: async () => null } as never,
    idempotency as never,
    outbox as never,
    relay as never,
    { listForTarget: async () => [] } as never,
    {} as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { recordUsage: async () => undefined } as never,
  );

  await assert.rejects(() => service.post(actor, "ws1", draft.id));
  const after = await expenses.get("ws1", draft.id, "alice");
  assert.equal(after?.status, "submitted");
  assert.equal((await ledger.listForWorkspace("ws1", "alice")).length, 0);
});

test("settlement confirm rolls back status when journal fails (memory)", async () => {
  const settlements = new MemorySettlementStore();
  const ledger = failingLedger(new MemoryLedgerStore());
  const created = await settlements.createClaim("alice", {
    workspaceId: "ws1",
    fromUserId: "bob",
    toUserId: "alice",
    amount: { amountMinor: "5000", currency: "IRR" },
    idempotencyKey: "atom-settle-1",
  });

  const access = {
    requireMemberRole: async () => "member",
    requireAccess: async () => ({
      role: "member",
      decision: { allowed: true },
    }),
    assertNotReadOnly: () => undefined,
    requireMember: async () => undefined,
  };
  const service = new SettlementsService(
    settlements,
    ledger,
    access as never,
    { append: async () => undefined } as never,
    idempotency as never,
    {
      insert: async (input: Record<string, unknown>) => ({
        id: "ob-s1",
        ...input,
        createdAt: new Date().toISOString(),
        attempts: 0,
      }),
    } as never,
    { correlation: () => ({}), dispatch: async () => undefined } as never,
    { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
  );

  await assert.rejects(() => service.confirm(actor, "ws1", created.id));
  const after = await settlements.get("ws1", created.id, "alice");
  assert.equal(after?.status, "claimed");
});

test("expense post + journal happy path still consistent", async () => {
  const expenses = new MemoryExpenseStore();
  const ledger = new MemoryLedgerStore();
  const draft = await expenses.createDraft("alice", {
    workspaceId: "ws1",
    title: "شام",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-09-02",
    idempotencyKey: "atom-ok-1",
  });
  await expenses.submit("ws1", draft.id, "alice");

  const outbox = {
    insert: async (input: {
      workspaceId: string;
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }) => ({
      id: "outbox-ok",
      ...input,
      createdAt: new Date().toISOString(),
      attempts: 0,
    }),
  };
  const relay = {
    correlation: () => ({}),
    dispatch: async () => undefined,
  };
  const service = new ExpensesService(
    expenses,
    {
      get: async () => ({
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
      }),
    } as never,
    ledger,
    {
      getWorkspaceForUser: async () => ({ template: "friends" }),
      listMembers: async () => [{ userId: "alice", role: "owner" }],
    } as never,
    {
      requireMemberRole: async () => "owner",
      requireAccess: async () => ({
        role: "owner",
        decision: { allowed: true },
      }),
      assertNotReadOnly: () => undefined,
    } as never,
    { append: async () => undefined } as never,
    { applyCompanyExpenseSpend: async () => null } as never,
    idempotency as never,
    outbox as never,
    relay as never,
    { listForTarget: async () => [] } as never,
    {} as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { recordUsage: async () => undefined } as never,
  );

  const summary: ExpenseSummary = await service.post(actor, "ws1", draft.id);
  assert.equal(summary.status, "posted");
  assert.equal((await ledger.listForWorkspace("ws1", "alice")).length, 1);
});
