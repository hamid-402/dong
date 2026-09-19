/**
 * Posting an expense must also move the member invoice and announce it, in the
 * same request — no manual generate, no second click, no stale UI.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor } from "@dang/contracts";
import { MemoryBillingStore } from "../billing/memory-billing.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";

const actor: AuthActor = {
  userId: "alice",
  externalSubject: "dev|alice",
  displayName: "Alice",
  authMode: "dev",
};

const idempotency = {
  run: async <T>(_scope: string, _user: string, _key: string, work: () => Promise<T>) =>
    work(),
};

type OutboxRow = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
};

function buildService(
  expenses: MemoryExpenseStore,
  billing: MemoryBillingStore,
  captured: OutboxRow[],
) {
  const outbox = {
    insert: async (input: { eventType: string; payload: Record<string, unknown> }) => {
      const row = {
        id: `outbox-${captured.length + 1}`,
        ...input,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };
      captured.push(row as OutboxRow);
      return row;
    },
  };
  return new ExpensesService(
    expenses,
    {
      get: async () => ({
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
      }),
    } as never,
    new MemoryLedgerStore(),
    {
      getWorkspaceForUser: async () => ({ template: "friends" }),
      listMembers: async () => [
        { userId: "alice", role: "owner" },
        { userId: "bob", role: "member" },
      ],
    } as never,
    {
      requireMemberRole: async () => "owner",
      requireAccess: async () => ({ role: "owner", decision: { allowed: true } }),
      assertNotReadOnly: () => undefined,
      requireMember: async () => undefined,
    } as never,
    { append: async () => undefined } as never,
    { applyCompanyExpenseSpend: async () => null } as never,
    idempotency as never,
    outbox as never,
    { correlation: () => ({}), dispatch: async () => undefined } as never,
    { listForTarget: async () => [] } as never,
    {
      approve: async () => undefined,
      pending: async () => [],
      createFirst: async () => undefined,
    } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
      resolveThresholdMinor: async () => null,
    } as never,
    { recordUsage: async () => undefined } as never,
    undefined,
    undefined,
    billing,
  );
}

test("createDraft infers the period, and commit=auto posts and bills in one call", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const captured: OutboxRow[] = [];
  const service = buildService(expenses, billing, captured);

  const created = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "ناهار تیم",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-05",
    commit: "auto",
    idempotencyKey: "wire-1",
  });

  assert.equal(created.status, "posted", "policy allows an immediate posting");
  assert.ok(created.periodId, "period must be inferred from the expense date");

  const invoices = await billing.listInvoices("ws1", created.periodId!, "alice");
  assert.equal(invoices.length, 2);
  const bob = invoices.find((invoice) => invoice.memberUserId === "bob");
  assert.equal(bob?.total.amountMinor, "5000");
  assert.equal(bob?.status, "draft");

  const events = captured.map((row) => row.eventType);
  assert.ok(events.includes("expense.posted"));
  assert.ok(
    events.includes("invoice.recalculated"),
    "connected members must be told their invoice moved",
  );
  const recalculated = captured.find(
    (row) => row.eventType === "invoice.recalculated",
  );
  assert.deepEqual(
    (recalculated?.payload.memberUserIds as string[]).sort(),
    ["alice", "bob"],
  );
  assert.equal(recalculated?.payload.periodId, created.periodId);
});

test("reverse rolls the invoice back and announces it", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const captured: OutboxRow[] = [];
  const service = buildService(expenses, billing, captured);

  const created = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "شام",
    total: { amountMinor: "8000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-06",
    commit: "auto",
    idempotencyKey: "wire-2",
  });
  const periodId = created.periodId!;
  assert.equal((await billing.listInvoices("ws1", periodId, "alice")).length, 2);

  captured.length = 0;
  const reversed = await service.reverse(actor, "ws1", created.id);
  assert.equal(reversed.status, "reversed");
  assert.equal(
    (await billing.listInvoices("ws1", periodId, "alice")).length,
    0,
    "no committed expense left, so no invoice",
  );
  assert.ok(captured.some((row) => row.eventType === "expense.reversed"));
  assert.ok(captured.some((row) => row.eventType === "invoice.recalculated"));
});

test("an expense held for approval leaves the invoice untouched", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const captured: OutboxRow[] = [];
  const service = buildService(expenses, billing, captured);

  const created = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "خرید بزرگ",
    total: { amountMinor: "50000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-07",
    requiresApproval: true,
    commit: "auto",
    idempotencyKey: "wire-3",
  });

  assert.equal(created.status, "submitted");
  const invoices = await billing.listInvoices("ws1", created.periodId!, "alice");
  assert.equal(invoices.length, 0, "unposted amounts never enter a document");
  assert.equal(
    captured.some((row) => row.eventType === "invoice.recalculated"),
    false,
  );
});

test("a pending draft refreshes the pending figure on an existing invoice", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const captured: OutboxRow[] = [];
  const service = buildService(expenses, billing, captured);

  const posted = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "ناهار",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-05",
    commit: "auto",
    idempotencyKey: "pending-1",
  });
  const periodId = posted.periodId!;
  const before = await billing.listInvoices("ws1", periodId, "alice");
  assert.equal(before[0]?.pendingTotal?.amountMinor, "0");

  captured.length = 0;
  await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "تاکسی",
    total: { amountMinor: "4000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-06",
    requiresApproval: true,
    idempotencyKey: "pending-2",
  });

  const after = await billing.listInvoices("ws1", periodId, "alice");
  for (const invoice of after) {
    assert.equal(invoice.total.amountMinor, "5000", "committed total is untouched");
    assert.equal(invoice.pendingTotal?.amountMinor, "2000");
  }
  const event = captured.find((row) => row.eventType === "invoice.recalculated");
  assert.equal(event?.payload.reason, "expense.pending");
});

test("a cost dated inside a closed period lands in the live one", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const service = buildService(expenses, billing, []);
  const today = new Date().toISOString().slice(0, 10);
  const lastYear = `${(Number(today.slice(0, 4)) - 1).toString()}${today.slice(4)}`;

  // Close the books for the month that cost belongs to.
  const shut = await billing.ensureAutoPeriod("ws1", "alice", lastYear);
  await billing.closePeriod("ws1", shut.id, "alice");

  const late = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "فاکتور دیررس",
    total: { amountMinor: "8000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: lastYear,
    commit: "auto",
    idempotencyKey: "late-1",
  });

  assert.notEqual(late.periodId, shut.id, "a closed period must not accept postings");
  assert.equal(late.occurredOn, lastYear, "the real date is kept, only the period moved");
  const booked = await billing.getPeriod("ws1", late.periodId!, "alice");
  assert.equal(booked?.status, "open");
  const invoices = await billing.listInvoices("ws1", late.periodId!, "alice");
  assert.equal(invoices.length, 2, "the live period's invoices carry the late cost");
  assert.equal(invoices[0]?.total.amountMinor, "4000");
});

test("a closed period refuses an expense that names it explicitly", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const service = buildService(expenses, billing, []);
  const shut = await billing.ensureAutoPeriod("ws1", "alice", "2026-04-05");
  await billing.closePeriod("ws1", shut.id, "alice");

  await assert.rejects(
    () =>
      service.createDraft(actor, "ws1", {
        workspaceId: "ws1",
        title: "خرج در دورهٔ بسته",
        total: { amountMinor: "3000", currency: "IRR" },
        paidByUserId: "alice",
        splitMethod: "equal",
        participantUserIds: ["alice", "bob"],
        occurredOn: "2026-04-05",
        periodId: shut.id,
        idempotencyKey: "closed-explicit",
      }),
    (err: unknown) => {
      const body = (err as { getResponse: () => { code?: string } }).getResponse();
      assert.equal(body.code, "PERIOD_NOT_OPEN");
      return true;
    },
  );
  const listed = await expenses.listForWorkspace("ws1", "alice", {
    viewAllPrivate: true,
  });
  assert.equal(listed.length, 0, "nothing may be recorded against closed books");
});

test("cancelling a submitted expense takes it out of the pending figure", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const captured: OutboxRow[] = [];
  const service = buildService(expenses, billing, captured);

  const posted = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "ناهار",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-05",
    commit: "auto",
    idempotencyKey: "cancel-1",
  });
  const periodId = posted.periodId!;
  const held = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "خرید بزرگ",
    total: { amountMinor: "4000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-04-06",
    requiresApproval: true,
    commit: "auto",
    idempotencyKey: "cancel-2",
  });
  assert.equal(held.status, "submitted");
  const during = await billing.listInvoices("ws1", periodId, "alice");
  assert.equal(during[0]?.pendingTotal?.amountMinor, "2000");

  captured.length = 0;
  await service.reverse(actor, "ws1", held.id);

  const after = await billing.listInvoices("ws1", periodId, "alice");
  for (const invoice of after) {
    assert.equal(invoice.total.amountMinor, "5000", "committed total is untouched");
    assert.equal(invoice.pendingTotal?.amountMinor, "0", "the cancelled draft is gone");
  }
  const event = captured.find((row) => row.eventType === "invoice.recalculated");
  assert.equal(event?.payload.reason, "expense.pending");
});

test("promoting a private expense to company rewrites the invoice split", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const captured: OutboxRow[] = [];
  const service = buildService(expenses, billing, captured);

  const posted = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "تاکسی شخصی",
    total: { amountMinor: "6000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "amount",
    participantUserIds: ["alice"],
    splitLines: [{ userId: "alice", amount: { amountMinor: "6000", currency: "IRR" } }],
    visibility: "private",
    occurredOn: "2026-04-05",
    commit: "auto",
    idempotencyKey: "promote-1",
  });
  const periodId = posted.periodId!;
  const before = await billing.listInvoices("ws1", periodId, "alice");
  assert.equal(before[0]?.privateTotal.amountMinor, "6000");
  assert.equal(before[0]?.sharedTotal.amountMinor, "0");

  captured.length = 0;
  const promoted = await service.promotePrivateToCompany(actor, "ws1", posted.id);
  assert.equal(promoted.visibility, "company");

  const after = await billing.listInvoices("ws1", periodId, "alice");
  assert.equal(after[0]?.total.amountMinor, "6000", "the amount owed did not move");
  assert.equal(after[0]?.privateTotal.amountMinor, "0");
  assert.equal(after[0]?.sharedTotal.amountMinor, "6000");
  const event = captured.find((row) => row.eventType === "invoice.recalculated");
  assert.equal(event?.payload.reason, "expense.visibility");
});
