import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonalOverviewCsv,
  buildPersonalTransactionsCsv,
  enrichPersonalBudgetSummary,
  enrichSavingsGoalSummary,
  normalizePersonalBudgetAlertPercent,
  personalBudgetUsedPercent,
  personalFinanceIsoWeekKey,
  personalFinanceTrendBucketKey,
  personalTxnSignedDelta,
  resolveYearMonthDateBounds,
  slugifyPersonalCategory,
  spendingAlertPeriodBounds,
  weekDateBounds,
  yearMonthDateBounds,
  zeroIrr,
  irrMoney,
} from "../src/personal-finance.js";

test("irrMoney/zeroIrr build IRR money from bigint or string", () => {
  assert.deepEqual(irrMoney(5n), { amountMinor: "5", currency: "IRR" });
  assert.deepEqual(irrMoney("7"), { amountMinor: "7", currency: "IRR" });
  assert.deepEqual(zeroIrr(), { amountMinor: "0", currency: "IRR" });
});

test("personalTxnSignedDelta signs by kind and rejects non-positive amounts", () => {
  assert.equal(personalTxnSignedDelta("income", 10n), 10n);
  assert.equal(personalTxnSignedDelta("transfer_in", 10n), 10n);
  assert.equal(personalTxnSignedDelta("adjustment", 10n), 10n);
  for (const kind of ["expense", "transfer_out", "investment", "installment"] as const) {
    assert.equal(personalTxnSignedDelta(kind, 10n), -10n, kind);
  }
  assert.throws(() => personalTxnSignedDelta("income", 0n), /TXN_AMOUNT/);
  assert.throws(() => personalTxnSignedDelta("expense", -1n), /TXN_AMOUNT/);
});

test("normalizePersonalBudgetAlertPercent defaults to 80 and validates 1..100", () => {
  assert.equal(normalizePersonalBudgetAlertPercent(), 80);
  assert.equal(normalizePersonalBudgetAlertPercent(Number.NaN), 80);
  assert.equal(normalizePersonalBudgetAlertPercent(55.9), 55);
  assert.equal(normalizePersonalBudgetAlertPercent(100), 100);
  assert.throws(() => normalizePersonalBudgetAlertPercent(0), /ALERT_PERCENT/);
  assert.throws(() => normalizePersonalBudgetAlertPercent(101), /ALERT_PERCENT/);
});

test("personalBudgetUsedPercent clamps and handles zero limit", () => {
  assert.equal(personalBudgetUsedPercent(50n, 0n), 0);
  assert.equal(personalBudgetUsedPercent(50n, 200n), 25);
  assert.equal(personalBudgetUsedPercent(1_000_000n, 1n), 10_000);
});

test("enrichPersonalBudgetSummary computes remaining, level and percent", () => {
  const warn = enrichPersonalBudgetSummary({
    id: "b1",
    yearMonth: "2026-03",
    limitMinor: 1000n,
    spentMinor: 850n,
    alertPercent: 80,
    note: "food",
    createdAt: "2026-03-01T00:00:00Z",
  });
  assert.equal(warn.remaining.amountMinor, "150");
  assert.equal(warn.alertLevel, "warn");
  assert.equal(warn.usedPercent, 85);
  assert.equal(warn.limit.amountMinor, "1000");
  assert.equal(warn.note, "food");

  const over = enrichPersonalBudgetSummary({
    id: "b2",
    yearMonth: "2026-03",
    limitMinor: 1000n,
    spentMinor: 1200n,
    alertPercent: 80,
    createdAt: "2026-03-01T00:00:00Z",
  });
  assert.equal(over.remaining.amountMinor, "-200");
  assert.equal(over.alertLevel, "exceeded");
});

test("CSV builders convert minor IRR to toman and escape fields", () => {
  const tx = buildPersonalTransactionsCsv([
    {
      occurredOn: "2026-03-01",
      kind: "expense",
      accountName: 'Main, "Cash"',
      amountMinor: "12345",
      note: "line1\nline2",
    },
  ]);
  const [header, row] = tx.split(/\n(.+)/s);
  assert.equal(header, "date,kind,account,category,amount_toman,note");
  assert.ok(row!.startsWith('2026-03-01,expense,"Main, ""Cash""",,1234.5,"line1'));

  const ov = buildPersonalOverviewCsv([
    { workspaceName: "Home, Sweet", spaceKind: "group", paidMinor: "100", shareMinor: "50", netMinor: "-20", expenseCount: 3 },
  ]);
  assert.equal(
    ov,
    'workspace,space_kind,paid_toman,share_toman,net_toman,expense_count\n"Home, Sweet",group,10,5,-2,3',
  );
  assert.equal(buildPersonalOverviewCsv([]), "workspace,space_kind,paid_toman,share_toman,net_toman,expense_count");
});

test("slugifyPersonalCategory keeps latin/persian letters and falls back to a generated slug", () => {
  assert.equal(slugifyPersonalCategory("  Food+Drink "), "fooddrink");
  assert.equal(slugifyPersonalCategory("Food Drink"), "food-drink");
  assert.equal(slugifyPersonalCategory("خرید روزانه"), "خرید-روزانه");
  assert.equal(slugifyPersonalCategory("a".repeat(100)).length, 48);
  assert.match(slugifyPersonalCategory("!!!"), /^cat-[0-9a-z]+$/);
});

test("ISO week keys and trend bucket keys", () => {
  assert.equal(personalFinanceIsoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(personalFinanceIsoWeekKey("2026-03-02"), "2026-W10");
  assert.equal(personalFinanceIsoWeekKey("2024-12-30"), "2025-W01");
  assert.equal(personalFinanceIsoWeekKey("2021-01-03"), "2020-W53");
  assert.equal(personalFinanceTrendBucketKey("2026-03-15", "day"), "2026-03-15");
  assert.equal(personalFinanceTrendBucketKey("2026-03-15", "month"), "2026-03");
  assert.equal(personalFinanceTrendBucketKey("2026-03-15", "week"), "2026-W11");
});

test("enrichSavingsGoalSummary derives status from real progress", () => {
  const base = {
    id: "g1",
    name: "Car",
    targetMinor: 1000n,
    createdAt: "2026-01-01T00:00:00Z",
  };
  const active = enrichSavingsGoalSummary({
    ...base,
    contributionAmountMinors: [200n, -5n],
    ledgerDepositMinors: [100n],
    status: "active",
    targetDate: null,
    accountId: null,
  });
  assert.equal(active.status, "active");
  assert.equal(active.contributed.amountMinor, "300");
  assert.equal(active.progressPercent, 30);
  assert.equal(active.targetDate, undefined);
  assert.equal(active.accountId, undefined);

  const reached = enrichSavingsGoalSummary({
    ...base,
    contributionAmountMinors: [1000n],
    status: "active",
    targetDate: "2026-12-01",
    accountId: "a1",
  });
  assert.equal(reached.status, "reached");
  assert.equal(reached.targetDate, "2026-12-01");
  assert.equal(reached.accountId, "a1");

  const sticky = enrichSavingsGoalSummary({
    ...base,
    contributionAmountMinors: [10n],
    status: "reached",
    reachedAt: "2026-02-01T00:00:00Z",
  });
  assert.equal(sticky.status, "reached");
  assert.equal(sticky.reachedAt, "2026-02-01T00:00:00Z");

  const archived = enrichSavingsGoalSummary({
    ...base,
    contributionAmountMinors: [5000n],
    status: "archived",
  });
  assert.equal(archived.status, "archived");
});

test("yearMonthDateBounds handles Gregorian months and rejects bad/Jalali input", () => {
  assert.deepEqual(yearMonthDateBounds("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(yearMonthDateBounds("2024-02"), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(yearMonthDateBounds("2026-12"), { from: "2026-12-01", to: "2026-12-31" });
  assert.throws(() => yearMonthDateBounds("2026-13"), /YEAR_MONTH$/);
  assert.throws(() => yearMonthDateBounds("2026-3"), /YEAR_MONTH$/);
  assert.throws(() => yearMonthDateBounds("1405-01"), /YEAR_MONTH_JALALI/);
});

test("resolveYearMonthDateBounds delegates Jalali months to the supplied resolver", () => {
  const jalali = (ym: string) => ({ from: `${ym}-01`, to: `${ym}-31` });
  assert.deepEqual(resolveYearMonthDateBounds("1405-02", jalali), { from: "1405-02-01", to: "1405-02-31" });
  assert.deepEqual(resolveYearMonthDateBounds("2026-02", jalali), { from: "2026-02-01", to: "2026-02-28" });
  // 1299 is outside the Jalali window, so the Gregorian path is used.
  assert.deepEqual(resolveYearMonthDateBounds("1299-12", () => ({ from: "x", to: "y" })), {
    from: "1299-12-01",
    to: "1299-12-31",
  });
});

test("weekDateBounds returns Monday..Sunday and rejects malformed dates", () => {
  assert.deepEqual(weekDateBounds("2026-03-04"), { from: "2026-03-02", to: "2026-03-08" });
  assert.deepEqual(weekDateBounds("2026-03-08"), { from: "2026-03-02", to: "2026-03-08" });
  assert.deepEqual(weekDateBounds("2026-03-02"), { from: "2026-03-02", to: "2026-03-08" });
  assert.deepEqual(weekDateBounds("2026-01-01"), { from: "2025-12-29", to: "2026-01-04" });
  assert.throws(() => weekDateBounds("2026-3-4"), /DATE/);
});

test("spendingAlertPeriodBounds supports week and month periods", () => {
  assert.deepEqual(spendingAlertPeriodBounds("week", "2026-03-04"), { from: "2026-03-02", to: "2026-03-08" });
  assert.deepEqual(spendingAlertPeriodBounds("month", "2026-03-04"), { from: "2026-03-01", to: "2026-03-31" });
});
