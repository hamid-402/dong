/**
 * Live draft invoices: the period is inferred from the expense date, and the
 * draft invoice tracks posted expenses without any manual generate step.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { jalaliMonthPeriodForDate } from "@dang/contracts";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryBillingStore } from "./memory-billing.store.js";

const WS = "ws1";
const SPENT_ON = "2026-04-05";

async function seedPostedExpense(
  expenses: MemoryExpenseStore,
  options: {
    periodId: string;
    idempotencyKey: string;
    totalMinor: string;
    participants?: string[];
  },
) {
  const draft = await expenses.createDraft("alice", {
    workspaceId: WS,
    title: "ناهار",
    total: { amountMinor: options.totalMinor, currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: options.participants ?? ["alice", "bob"],
    occurredOn: SPENT_ON,
    periodId: options.periodId,
    idempotencyKey: options.idempotencyKey,
  });
  await expenses.submit(WS, draft.id, "alice");
  await expenses.post(WS, draft.id, "alice");
  return draft;
}

test("ensureAutoPeriod opens the Jalali month once and reuses it", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);

  const first = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const expected = jalaliMonthPeriodForDate(SPENT_ON);
  assert.equal(first.startsOn, expected.startsOn);
  assert.equal(first.endsOn, expected.endsOn);
  assert.equal(first.cadence, "jalali_month");
  assert.equal(first.autoRollover, true);

  const second = await billing.ensureAutoPeriod(WS, "bob", "2026-04-18");
  assert.equal(second.id, first.id, "same month must not open a second period");
  assert.equal((await billing.listPeriods(WS, "alice")).length, 1);
});

test("recalculate builds the draft invoice from posted splits only", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-1",
    totalMinor: "10000",
  });

  const pendingDraft = await expenses.createDraft("alice", {
    workspaceId: WS,
    title: "تاکسی",
    total: { amountMinor: "4000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: SPENT_ON,
    periodId: period.id,
    idempotencyKey: "live-pending",
  });
  await expenses.submit(WS, pendingDraft.id, "alice");

  const result = await billing.recalculateMemberInvoices({
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: ["alice", "bob"],
    reason: "expense.posted",
  });
  assert.equal(result.updated.length, 2);

  const invoices = await billing.listInvoices(WS, period.id, "alice");
  const bob = invoices.find((invoice) => invoice.memberUserId === "bob");
  assert.equal(bob?.status, "draft");
  assert.equal(bob?.total.amountMinor, "5000");
  assert.equal(bob?.pendingTotal?.amountMinor, "2000");
  assert.equal(bob?.version, 1);
  assert.ok(bob?.recalculatedAt);
});

test("recalculate is idempotent — nothing changes on a repeat pass", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-2",
    totalMinor: "10000",
  });

  const input = {
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: ["alice", "bob"],
    reason: "expense.posted",
  };
  await billing.recalculateMemberInvoices(input);
  const again = await billing.recalculateMemberInvoices(input);
  assert.equal(again.updated.length, 0);
  assert.deepEqual(again.unchangedMemberUserIds.sort(), ["alice", "bob"]);

  const invoices = await billing.listInvoices(WS, period.id, "alice");
  assert.ok(invoices.every((invoice) => invoice.version === 1));
});

test("a second posted expense bumps the invoice version and total", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const input = {
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: ["alice", "bob"],
    reason: "expense.posted",
  };

  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-3a",
    totalMinor: "10000",
  });
  await billing.recalculateMemberInvoices(input);

  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-3b",
    totalMinor: "6000",
  });
  await billing.recalculateMemberInvoices(input);

  const bob = (await billing.listInvoices(WS, period.id, "alice")).find(
    (invoice) => invoice.memberUserId === "bob",
  );
  assert.equal(bob?.total.amountMinor, "8000");
  assert.equal(bob?.version, 2);
  assert.equal(bob?.lines.length, 2);
});

test("reversing the only expense clears the draft invoice", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const draft = await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-4",
    totalMinor: "10000",
  });
  const input = {
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: ["alice", "bob"],
    reason: "expense.posted",
  };
  await billing.recalculateMemberInvoices(input);
  assert.equal((await billing.listInvoices(WS, period.id, "alice")).length, 2);

  await expenses.reverse(WS, draft.id, "alice");
  await billing.recalculateMemberInvoices({ ...input, reason: "expense.reversed" });
  assert.equal((await billing.listInvoices(WS, period.id, "alice")).length, 0);
});

test("a locked invoice is never rewritten; the delta becomes an adjustment", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  const input = {
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: ["alice", "bob"],
    reason: "expense.posted",
  };

  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-5a",
    totalMinor: "10000",
  });
  await billing.recalculateMemberInvoices(input);

  const bobInvoice = (await billing.listInvoices(WS, period.id, "alice")).find(
    (invoice) => invoice.memberUserId === "bob",
  );
  assert.ok(bobInvoice);
  await billing.approveInvoice(WS, bobInvoice.id, "bob");

  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-5b",
    totalMinor: "4000",
  });
  const result = await billing.recalculateMemberInvoices(input);

  const frozen = (await billing.listInvoices(WS, period.id, "alice")).find(
    (invoice) => invoice.memberUserId === "bob",
  );
  assert.equal(frozen?.status, "approved");
  assert.equal(frozen?.total.amountMinor, "5000", "locked document must not move");

  const adjustment = result.adjustments.find(
    (row) => row.memberUserId === "bob",
  );
  assert.equal(adjustment?.delta.amountMinor, "2000");
  const stored = await billing.listAdjustments(WS, period.id, "alice");
  assert.equal(stored.length, 1);

  // Repeating the same pass must not raise a duplicate notice.
  await billing.recalculateMemberInvoices(input);
  assert.equal((await billing.listAdjustments(WS, period.id, "alice")).length, 1);
});

test("rollover opens the next month exactly once", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);

  const dayAfter = new Date(`${period.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const today = dayAfter.toISOString().slice(0, 10);

  const opened = await billing.rolloverDuePeriods(WS, "alice", today);
  assert.equal(opened.length, 1);
  assert.ok((opened[0]?.startsOn ?? "") > period.endsOn);

  const second = await billing.rolloverDuePeriods(WS, "alice", today);
  assert.equal(second.length, 0, "rollover must not duplicate the next period");
});

test("manual generate and the live path agree on the same figures", async () => {
  const expenses = new MemoryExpenseStore();
  const billing = new MemoryBillingStore(expenses);
  const period = await billing.ensureAutoPeriod(WS, "alice", SPENT_ON);
  await seedPostedExpense(expenses, {
    periodId: period.id,
    idempotencyKey: "live-6",
    totalMinor: "10000",
  });

  await billing.recalculateMemberInvoices({
    workspaceId: WS,
    periodId: period.id,
    actorUserId: "alice",
    memberUserIds: ["alice", "bob"],
    reason: "expense.posted",
  });
  const live = (await billing.listInvoices(WS, period.id, "alice"))
    .map((invoice) => `${invoice.memberUserId}:${invoice.total.amountMinor}`)
    .sort();

  await billing.generateInvoices(WS, period.id, "alice", {});
  const generated = (await billing.listInvoices(WS, period.id, "alice"))
    .map((invoice) => `${invoice.memberUserId}:${invoice.total.amountMinor}`)
    .sort();

  assert.deepEqual(generated, live);
});
