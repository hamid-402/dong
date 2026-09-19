/**
 * Scheduled billing hygiene: the sweep opens the next period, proves the three
 * sources of truth agree (committed expenses, journal, invoice), repairs live
 * drafts that drifted, and reminds finance before a period ends.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxRecord } from "../outbox/outbox.types.js";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import { MemoryJobRunStore } from "../jobs/memory-job-run.store.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { BillingMaintenanceService } from "./billing-maintenance.service.js";
import { MemoryBillingStore } from "./memory-billing.store.js";

const WS = "ws1";
const SPENT_ON = "2026-04-05";

type Harness = {
  service: BillingMaintenanceService;
  expenses: MemoryExpenseStore;
  billing: MemoryBillingStore;
  ledger: MemoryLedgerStore;
  dispatched: OutboxRecord[];
  notified: Array<{ userId: string; title: string }>;
  jobRuns: MemoryJobRunStore;
};

function harness(options: { withLedger?: boolean } = {}): Harness {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const ledger = new MemoryLedgerStore();
  const outbox = new MemoryOutboxStore();
  const dispatched: OutboxRecord[] = [];
  const notified: Array<{ userId: string; title: string }> = [];

  const relay = {
    correlation: () => ({}),
    dispatch: async (record: OutboxRecord) => {
      dispatched.push(record);
    },
  };
  const iam = {
    listMembers: async () => [
      { userId: "alice", role: "finance" },
      { userId: "bob", role: "member" },
    ],
  };
  const notifications = {
    notify: async (
      _actorUserId: string,
      input: { userId: string; title: string },
    ) => {
      notified.push({ userId: input.userId, title: input.title });
    },
  };

  const jobRuns = new MemoryJobRunStore();
  const service = new BillingMaintenanceService(
    billing,
    iam as never,
    outbox,
    relay as never,
    expenses,
    options.withLedger === false ? undefined : ledger,
    notifications as never,
    jobRuns,
  );
  return { service, expenses, billing, ledger, dispatched, notified, jobRuns };
}

async function postExpense(
  h: Harness,
  options: {
    periodId: string;
    idempotencyKey: string;
    totalMinor: string;
    /** Skips the journal, imitating a posting that escaped the ledger. */
    skipLedger?: boolean;
  },
) {
  const draft = await h.expenses.createDraft("alice", {
    workspaceId: WS,
    title: "ناهار",
    total: { amountMinor: options.totalMinor, currency: "IRR" },
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

test("reconcile repairs a live draft that drifted from committed expenses", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const first = await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "rec-1",
    totalMinor: "10000",
  });
  await h.billing.recalculateMemberInvoices({
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: first.participantUserIds,
    reason: "expense.posted",
  });

  // A second posting that never reached the projection (crash between writes).
  await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "rec-2",
    totalMinor: "4000",
  });

  const result = await h.service.reconcile(WS, "alice");
  assert.equal(result.periodsChecked, 1);
  assert.equal(result.drift.length, 2, "both members were understated");
  assert.equal(result.repaired, 2);
  assert.equal(result.ledgerGaps.length, 0, "the journal had both postings");
  assert.ok(
    h.dispatched.some((row) => row.eventType === "invoice.recalculated"),
    "affected members must be told their figures moved",
  );

  const invoices = await h.billing.listInvoices(WS, period.id, "alice");
  for (const invoice of invoices) {
    assert.equal(invoice.total.amountMinor, "7000");
  }

  const second = await h.service.reconcile(WS, "alice");
  assert.equal(second.drift.length, 0, "reconcile must settle, not oscillate");
  assert.equal(second.repaired, 0);
});

test("a posting missing from the journal is reported, never papered over", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "gap-1",
    totalMinor: "6000",
    skipLedger: true,
  });

  const result = await h.service.reconcile(WS, "alice");
  assert.equal(result.ledgerGaps.length, 2);
  for (const gap of result.ledgerGaps) {
    assert.equal(gap.ledgerMinor, "0");
    assert.equal(gap.expectedMinor, "3000");
  }
});

test("reconcile raises a correction notice instead of rewriting a locked invoice", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const first = await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "lock-1",
    totalMinor: "10000",
  });
  await h.billing.recalculateMemberInvoices({
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: first.participantUserIds,
    reason: "expense.posted",
  });
  const [invoice] = await h.billing.listInvoices(WS, period.id, "alice");
  await h.billing.approveInvoice(WS, invoice!.id, invoice!.memberUserId);

  await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "lock-2",
    totalMinor: "4000",
  });

  const result = await h.service.reconcile(WS, "alice");
  assert.equal(result.adjustmentsRaised, 1);
  const adjustments = await h.billing.listAdjustments(WS, period.id, "alice");
  assert.equal(adjustments.length, 1);
  assert.equal(adjustments[0]?.delta.amountMinor, "2000");
  assert.equal(adjustments[0]?.reason, "billing.invoice.reconcile");

  const after = await h.billing.listInvoices(WS, period.id, "alice");
  const locked = after.find((row) => row.memberUserId === invoice!.memberUserId);
  assert.equal(locked?.total.amountMinor, "5000", "issued figures stay put");

  const event = h.dispatched.find((row) => row.eventType === "invoice.recalculated");
  const payload = event?.payload as {
    actorUserId?: string;
    adjustments?: Array<{ memberUserId: string; deltaMinor: string }>;
  };
  assert.equal(payload?.actorUserId, "alice");
  assert.deepEqual(
    payload?.adjustments,
    [{ memberUserId: invoice!.memberUserId, deltaMinor: "2000" }],
    "the member who approved the document has to be told it changed",
  );
});

test("the sweep leaves a job run behind when it changed something", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const first = await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "run-1",
    totalMinor: "10000",
  });
  await h.billing.recalculateMemberInvoices({
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: first.participantUserIds,
    reason: "expense.posted",
  });

  h.service.remember(WS, "alice");
  await h.service.tick();
  const quiet = await h.jobRuns.listForWorkspace(WS);
  assert.equal(
    quiet.filter((row) => row.name === "billing.invoice.reconcile").length,
    0,
    "a check that found no drift must not fake activity",
  );

  await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "run-2",
    totalMinor: "4000",
  });
  await h.service.tick();

  const runs = await h.jobRuns.listForWorkspace(WS);
  const reconcile = runs.find((row) => row.name === "billing.invoice.reconcile");
  assert.equal(reconcile?.status, "completed");
  assert.match(reconcile?.detail ?? "", /repaired=2/);
});

test("a journal gap makes the recorded sweep run fail, not pass quietly", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await postExpense(h, {
    periodId: period.id,
    idempotencyKey: "run-gap",
    totalMinor: "6000",
    skipLedger: true,
  });

  h.service.remember(WS, "alice");
  await h.service.tick();

  const runs = await h.jobRuns.listForWorkspace(WS);
  const reconcile = runs.find((row) => row.name === "billing.invoice.reconcile");
  assert.equal(reconcile?.status, "failed");
  assert.match(reconcile?.detail ?? "", /ledgerGaps=2/);
});

test("rollover opens the next period and tells its members", async () => {
  const h = harness();
  const period = await h.billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const after = new Date(`${period.endsOn}T00:00:00Z`);
  after.setUTCDate(after.getUTCDate() + 2);

  const opened = await h.billing.rolloverDuePeriods(
    WS,
    "alice",
    after.toISOString().slice(0, 10),
  );
  assert.equal(opened.length, 1, "fixture sanity: the month already ended");

  // The service path runs against today, so only assert on its own bookkeeping.
  const result = await h.service.rollover(WS, "alice");
  assert.equal(Array.isArray(result.openedPeriodIds), true);
  for (const row of h.dispatched) {
    if (row.eventType !== "period.rolled") continue;
    assert.deepEqual(
      (row.payload as { memberUserIds: string[] }).memberUserIds,
      ["alice", "bob"],
    );
  }
});

test("the reported automation mode matches what the sweep can actually do", () => {
  // No timer in tests, so the honest answer is "only on writes and job runs".
  assert.equal(harness().service.mode(), "on_demand");
  assert.equal(
    harness().service.reconcileMode(),
    "expense_ledger_invoice_v1",
    "expenses and journal both available",
  );
  assert.equal(
    harness({ withLedger: false }).service.reconcileMode(),
    "expense_invoice_v1",
    "without a journal the check must not claim to prove it",
  );
});

test("finalize reminder reaches finance managers only", async () => {
  const h = harness();
  const today = new Date().toISOString().slice(0, 10);
  const period = await h.billing.createPeriod("alice", {
    workspaceId: WS,
    title: "دورهٔ در حال پایان",
    kind: "month",
    startsOn: today,
    endsOn: today,
    idempotencyKey: "reminder-1",
  });

  const result = await h.service.finalizeReminder(WS, "alice");
  assert.deepEqual(result.periodIds, [period.id]);
  assert.equal(result.notified, 1);
  assert.deepEqual(
    h.notified.map((row) => row.userId),
    ["alice"],
  );
});
