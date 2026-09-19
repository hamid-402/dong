/**
 * Closing a period freezes what every member owes. These tests cover the
 * internal control on that door: drift in the live projection is repaired and
 * the close proceeds, but a journal that disagrees with the committed expenses
 * holds the period open until a human looks at it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor } from "@dang/contracts";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { BillingMaintenanceService } from "./billing-maintenance.service.js";
import { BillingService } from "./billing.service.js";
import { InvoiceEventsService } from "./invoice-events.service.js";
import { MemoryBillingStore } from "./memory-billing.store.js";

const WS = "ws1";
const SPENT_ON = "2026-04-05";
const actor: AuthActor = {
  userId: "alice",
  externalSubject: "alice",
  displayName: "آلیس",
  authMode: "dev",
};

function harness(options: { withLedger?: boolean } = {}) {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const ledger = new MemoryLedgerStore();
  const outbox = new MemoryOutboxStore();
  const dispatched: string[] = [];
  const relay = {
    correlation: () => ({}),
    // Records what would reach the members' screens; leaves the row pending so
    // the test can read the payload the relay was handed.
    dispatch: async (record: { eventType: string }) => {
      dispatched.push(record.eventType);
    },
  };
  const iam = {
    listMembers: async () => [
      { userId: "alice", role: "finance" },
      { userId: "bob", role: "member" },
    ],
  };
  const maintenance = new BillingMaintenanceService(
    billing,
    iam as never,
    outbox,
    relay as never,
    expenses,
    options.withLedger === false ? undefined : ledger,
    undefined,
  );
  const access = {
    requireFinanceManager: async () => "finance",
    requireMemberRole: async () => "finance",
    requireMember: async () => undefined,
    assertNotReadOnly: () => undefined,
  };
  const service = new BillingService(
    billing,
    access as never,
    { append: async () => undefined } as never,
    { run: async (_a: string, _b: string, _c: string, fn: () => unknown) => fn() } as never,
    { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
    { notify: async () => undefined } as never,
    new InvoiceEventsService(outbox, relay as never),
    maintenance,
  );
  return { service, billing, expenses, ledger, outbox, dispatched };
}

async function postExpense(
  h: ReturnType<typeof harness>,
  options: { periodId: string; idempotencyKey: string; skipLedger?: boolean },
) {
  const draft = await h.expenses.createDraft("alice", {
    workspaceId: WS,
    title: "ناهار",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: SPENT_ON,
    periodId: options.periodId,
    idempotencyKey: options.idempotencyKey,
  });
  await h.expenses.submit(WS, draft.id, "alice");
  const posted = await h.expenses.post(WS, draft.id, "alice");
  if (!options.skipLedger) await h.ledger.postExpense("alice", posted);
  return posted;
}

test("a period with a journal gap cannot be closed", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, { periodId: period.id, idempotencyKey: "gap-1", skipLedger: true });

  await assert.rejects(
    () => h.service.closePeriod(actor, WS, period.id, {}),
    (error: unknown) => {
      const response = (error as { response?: { detail?: string } }).response;
      assert.match(String(response?.detail), /دفتر|بسته نمی‌شود/);
      return true;
    },
  );
  const [stored] = await h.billing.listPeriods(WS, "alice");
  assert.equal(stored?.status, "open", "the period stayed open");
});

test("close repairs drifted drafts first, then closes", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, { periodId: period.id, idempotencyKey: "ok-1" });
  // Nothing ever projected this posting into an invoice.
  assert.equal((await h.billing.listInvoices(WS, period.id, "alice")).length, 0);

  const closed = await h.service.closePeriod(actor, WS, period.id, {});
  assert.equal(closed.status, "closed");
  const invoices = await h.billing.listInvoices(WS, period.id, "alice");
  assert.equal(invoices.length, 2, "reconcile wrote the missing documents");
  assert.equal(invoices[0]?.total.amountMinor, "5000");
});

test("an unresolved dispute holds the period open until finance answers it", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, { periodId: period.id, idempotencyKey: "dispute-1" });
  const [invoice] = await h.billing.generateInvoices(WS, period.id, "alice", {});
  assert.ok(invoice);
  await h.billing.disputeInvoice(
    WS,
    invoice.id,
    invoice.memberUserId,
    "سهم من اشتباه است",
  );

  await assert.rejects(
    () => h.service.closePeriod(actor, WS, period.id, {}),
    (error: unknown) => {
      const response = (error as { response?: { code?: string } }).response;
      assert.equal(response?.code, "PERIOD_INVOICES_DISPUTED");
      return true;
    },
  );
  const [stored] = await h.billing.listPeriods(WS, "alice");
  assert.equal(stored?.status, "open", "silence must not settle the argument");

  const resolved = await h.service.resolveInvoiceDispute(actor, WS, invoice.id, {
    outcome: "rejected",
    note: "سهم بر اساس تقسیم مساوی درست است",
  });
  assert.equal(resolved.status, "issued", "a rejected objection leaves the document as issued");
  assert.equal(resolved.disputeNote, undefined);
  const closed = await h.service.closePeriod(actor, WS, period.id, {});
  assert.equal(closed.status, "closed");
});

test("an accepted dispute sends the document back to the live projection", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, { periodId: period.id, idempotencyKey: "dispute-2" });
  const [invoice] = await h.billing.generateInvoices(WS, period.id, "alice", {});
  assert.ok(invoice);
  await h.billing.disputeInvoice(WS, invoice.id, invoice.memberUserId, "دو بار حساب شده");

  h.dispatched.length = 0;
  const resolved = await h.service.resolveInvoiceDispute(actor, WS, invoice.id, {
    outcome: "accepted",
  });
  assert.equal(resolved.status, "draft", "back to draft so the expenses rewrite it");
  assert.deepEqual(h.dispatched, ["invoice.recalculated"]);

  // Being a draft again is what lets the projection correct the figure.
  const repaired = await h.billing.recalculateMemberInvoices({
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: [invoice.memberUserId],
    reason: "expense.posted",
  });
  assert.equal(repaired.adjustments.length, 0, "a draft is rewritten, not annotated");
});

test("closing is not blocked when the ledger cannot be consulted", async () => {
  const h = harness({ withLedger: false });
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, { periodId: period.id, idempotencyKey: "noledger-1", skipLedger: true });

  const closed = await h.service.closePeriod(actor, WS, period.id, {});
  assert.equal(closed.status, "closed", "a check that cannot run is not a lock");
});

test("marking an invoice paid announces it to the member", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, { periodId: period.id, idempotencyKey: "paid-1" });
  const [invoice] = await h.billing.generateInvoices(WS, period.id, "alice", {});
  assert.ok(invoice);
  await h.billing.issueInvoice(WS, invoice.id, "alice");

  h.dispatched.length = 0;
  const paid = await h.service.markInvoicePaid(actor, WS, invoice.id);
  assert.equal(paid.status, "paid");
  assert.deepEqual(h.dispatched, ["invoice.recalculated"]);
  const row = (await h.outbox.listPending(50)).at(-1);
  assert.equal(row?.eventType, "invoice.recalculated");
  assert.equal(
    (row?.payload as { reason?: string } | undefined)?.reason,
    "invoice.paid",
  );
});
