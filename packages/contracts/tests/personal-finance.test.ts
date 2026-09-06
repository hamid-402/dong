import assert from "node:assert/strict";
import test from "node:test";
import {
  actorExpenseSlice,
  aggregatePersonalFinanceTrends,
  buildPersonalTransactionsCsv,
  computePersonalAccountBalance,
  personalBudgetAlertLevel,
  personalBudgetUsedPercent,
  personalFinanceTrendBucketKey,
  groupDebtAlertLevel,
  shouldNotifyPersonalBudgetAlert,
  sumActorExpensesInRange,
  sumPersonalExpenseInMonth,
  type ExpenseSummary,
} from "../src/index.js";

function expense(
  partial: Partial<ExpenseSummary> &
    Pick<ExpenseSummary, "paidByUserId" | "total" | "splits" | "occurredOn" | "status">,
): ExpenseSummary {
  return {
    id: "e1",
    workspaceId: "w1",
    title: "t",
    visibility: "shared",
    paymentLines: partial.paymentLines ?? [],
    splitMethod: "equal",
    participantUserIds: partial.splits.map((s) => s.userId),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("actorExpenseSlice ignores draft and out-of-range", () => {
  const base = expense({
    status: "draft",
    occurredOn: "2026-03-10",
    paidByUserId: "u1",
    total: { amountMinor: "1000", currency: "IRR" },
    splits: [{ userId: "u1", amount: { amountMinor: "1000", currency: "IRR" } }],
  });
  assert.equal(actorExpenseSlice(base, "u1", "2026-03-01", "2026-03-31").counted, false);

  const posted = { ...base, status: "posted" as const, occurredOn: "2026-02-01" };
  assert.equal(actorExpenseSlice(posted, "u1", "2026-03-01", "2026-03-31").counted, false);
});

test("actor paid vs share across multi-payer split", () => {
  const row = expense({
    status: "posted",
    occurredOn: "2026-03-15",
    paidByUserId: "u1",
    total: { amountMinor: "3000", currency: "IRR" },
    paymentLines: [
      { userId: "u1", amount: { amountMinor: "2000", currency: "IRR" } },
      { userId: "u2", amount: { amountMinor: "1000", currency: "IRR" } },
    ],
    splits: [
      { userId: "u1", amount: { amountMinor: "1000", currency: "IRR" } },
      { userId: "u2", amount: { amountMinor: "2000", currency: "IRR" } },
    ],
  });
  const slice = actorExpenseSlice(row, "u1", "2026-03-01", "2026-03-31");
  assert.equal(slice.paidMinor, 2000n);
  assert.equal(slice.shareMinor, 1000n);
  assert.equal(slice.counted, true);

  const totals = sumActorExpensesInRange([row], "u1", "2026-03-01", "2026-03-31");
  assert.equal(totals.paid.amountMinor, "2000");
  assert.equal(totals.share.amountMinor, "1000");
  assert.equal(totals.expenseCount, 1);
});

test("computePersonalAccountBalance and month expense sum", () => {
  const bal = computePersonalAccountBalance(10_000n, [
    { kind: "income", amountMinor: 5_000n },
    { kind: "expense", amountMinor: 2_000n },
    { kind: "transfer_out", amountMinor: 1_000n },
    { kind: "transfer_in", amountMinor: 500n },
  ]);
  assert.equal(bal, 12_500n);
  const spent = sumPersonalExpenseInMonth(
    [
      { kind: "expense", amountMinor: 100n, occurredOn: "2026-09-01" },
      { kind: "expense", amountMinor: 50n, occurredOn: "2026-08-31" },
      { kind: "income", amountMinor: 999n, occurredOn: "2026-09-02" },
    ],
    "2026-09",
  );
  assert.equal(spent, 100n);
});

test("personalBudgetAlertLevel warn and exceeded", () => {
  assert.equal(personalBudgetAlertLevel(70n, 100n, 80), "ok");
  assert.equal(personalBudgetAlertLevel(80n, 100n, 80), "warn");
  assert.equal(personalBudgetAlertLevel(100n, 100n, 80), "exceeded");
  assert.equal(personalBudgetUsedPercent(25n, 100n), 25);
});

test("groupDebtAlertLevel uses absolute net thresholds", () => {
  assert.equal(groupDebtAlertLevel(0n), "ok");
  assert.equal(groupDebtAlertLevel(4_999_999n), "ok");
  assert.equal(groupDebtAlertLevel(5_000_000n), "warn");
  assert.equal(groupDebtAlertLevel(-5_000_000n), "warn");
  assert.equal(groupDebtAlertLevel(20_000_000n), "exceeded");
  assert.equal(groupDebtAlertLevel(-20_000_000n), "exceeded");
});

test("shouldNotifyPersonalBudgetAlert only on transition into warn/exceeded", () => {
  assert.equal(shouldNotifyPersonalBudgetAlert(undefined, "ok"), false);
  assert.equal(shouldNotifyPersonalBudgetAlert(undefined, "warn"), true);
  assert.equal(shouldNotifyPersonalBudgetAlert("ok", "warn"), true);
  assert.equal(shouldNotifyPersonalBudgetAlert("warn", "warn"), false);
  assert.equal(shouldNotifyPersonalBudgetAlert("warn", "exceeded"), true);
  assert.equal(shouldNotifyPersonalBudgetAlert("exceeded", "ok"), false);
});

test("aggregatePersonalFinanceTrends buckets day paid and personal expense", () => {
  const row = expense({
    id: "e2",
    status: "posted",
    occurredOn: "2026-09-02",
    paidByUserId: "u1",
    total: { amountMinor: "1000", currency: "IRR" },
    splits: [{ userId: "u1", amount: { amountMinor: "1000", currency: "IRR" } }],
  });
  const trends = aggregatePersonalFinanceTrends({
    from: "2026-09-01",
    to: "2026-09-30",
    groupBy: "day",
    groupExpenses: [row],
    actorUserId: "u1",
    personalExpenseTxns: [
      { kind: "expense", amountMinor: 500n, occurredOn: "2026-09-02" },
      { kind: "income", amountMinor: 900n, occurredOn: "2026-09-02" },
    ],
  });
  assert.equal(personalFinanceTrendBucketKey("2026-09-02", "month"), "2026-09");
  assert.equal(trends.buckets.length, 1);
  assert.equal(trends.buckets[0]?.key, "2026-09-02");
  assert.equal(trends.buckets[0]?.paid.amountMinor, "1000");
  assert.equal(trends.buckets[0]?.personalExpense.amountMinor, "500");
  assert.equal(trends.totals.personalExpense.amountMinor, "500");
});

test("buildPersonalTransactionsCsv has header and toman", () => {
  const csv = buildPersonalTransactionsCsv([
    {
      occurredOn: "2026-09-01",
      kind: "expense",
      accountName: "نقد",
      categoryName: "خوراک",
      amountMinor: "1000",
      note: "ناهار",
    },
  ]);
  assert.match(csv, /^date,kind,account,category,amount_toman,note/);
  assert.match(csv, /100/);
});
