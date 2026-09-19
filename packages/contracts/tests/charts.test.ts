import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateBalanceOverTime,
  aggregateBudgetBurn,
  aggregateCategoryMix,
  aggregateExpenseTrend,
  aggregateGoalProgress,
  aggregateIncomeVsExpense,
  aggregateMemberShare,
  chartMonthKeys,
  defaultChartDateRange,
  mergeSumChartSeries,
} from "../src/charts.js";
import type { ExpenseSummary } from "../src/finance.js";
import { irrMoney } from "../src/personal-finance.js";

const alice = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const catFood = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function postedExpense(
  partial: Partial<ExpenseSummary> &
    Pick<ExpenseSummary, "id" | "occurredOn" | "total" | "paidByUserId" | "splits">,
): ExpenseSummary {
  return {
    workspaceId: "ws-1",
    title: "fixture",
    status: "posted",
    visibility: "shared",
    splitMethod: "equal",
    participantUserIds: partial.splits.map((s) => s.userId),
    paymentLines: [
      { userId: partial.paidByUserId, amount: partial.total },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

test("S11-11 empty expense trend returns emptyReason", () => {
  const series = aggregateExpenseTrend({ months: 3, expenses: [] });
  assert.equal(series.points.length, 0);
  assert.ok(series.emptyReason);
});

test("S11-11 expense trend matches fixture month sums", () => {
  const asOf = new Date("2026-09-15T12:00:00.000Z");
  const expenses = [
    postedExpense({
      id: "e1",
      occurredOn: "2026-08-10",
      paidByUserId: alice,
      total: irrMoney(100_000n),
      splits: [
        { userId: alice, amount: irrMoney(50_000n) },
        { userId: bob, amount: irrMoney(50_000n) },
      ],
    }),
    postedExpense({
      id: "e2",
      occurredOn: "2026-08-20",
      paidByUserId: bob,
      total: irrMoney(50_000n),
      splits: [{ userId: bob, amount: irrMoney(50_000n) }],
    }),
    postedExpense({
      id: "e3",
      occurredOn: "2026-09-01",
      paidByUserId: alice,
      total: irrMoney(200_000n),
      splits: [{ userId: alice, amount: irrMoney(200_000n) }],
    }),
    // draft ignored
    {
      ...postedExpense({
        id: "e4",
        occurredOn: "2026-09-02",
        paidByUserId: alice,
        total: irrMoney(999_999n),
        splits: [{ userId: alice, amount: irrMoney(999_999n) }],
      }),
      status: "draft" as const,
    },
  ];
  const series = aggregateExpenseTrend({ months: 2, asOf, expenses });
  assert.equal(series.points.length, 2);
  assert.equal(series.points[0]?.key, "2026-08");
  assert.equal(series.points[0]?.valueMinor, "150000");
  assert.equal(series.points[1]?.key, "2026-09");
  assert.equal(series.points[1]?.valueMinor, "200000");
  assert.equal(series.emptyReason, undefined);
});

test("S11-11 member-share and category-mix match fixture sums", () => {
  const expenses = [
    postedExpense({
      id: "e1",
      occurredOn: "2026-09-05",
      paidByUserId: alice,
      categoryId: catFood,
      total: irrMoney(300_000n),
      splits: [
        { userId: alice, amount: irrMoney(100_000n) },
        { userId: bob, amount: irrMoney(200_000n) },
      ],
    }),
    postedExpense({
      id: "e2",
      occurredOn: "2026-09-06",
      paidByUserId: bob,
      total: irrMoney(50_000n),
      splits: [{ userId: alice, amount: irrMoney(50_000n) }],
    }),
  ];
  const share = aggregateMemberShare({
    from: "2026-09-01",
    to: "2026-09-30",
    expenses,
    memberLabels: new Map([
      [alice, "آلیس"],
      [bob, "باب"],
    ]),
  });
  assert.equal(share.points.find((p) => p.key === alice)?.valueMinor, "150000");
  assert.equal(share.points.find((p) => p.key === alice)?.label, "آلیس");
  assert.equal(share.points.find((p) => p.key === bob)?.valueMinor, "200000");
  assert.equal(share.points.find((p) => p.key === bob)?.label, "باب");

  const mix = aggregateCategoryMix({
    from: "2026-09-01",
    to: "2026-09-30",
    expenses,
    categoryLabels: new Map([[catFood, "خوراک"]]),
  });
  assert.equal(mix.points.find((p) => p.key === catFood)?.valueMinor, "300000");
  assert.equal(mix.points.find((p) => p.key === catFood)?.label, "خوراک");
  assert.equal(mix.points.find((p) => p.key === "uncategorized")?.valueMinor, "50000");
});

test("S11-11 balance-over-time uses provisional nets from fixtures", () => {
  const expenses = [
    postedExpense({
      id: "e1",
      occurredOn: "2026-09-01",
      paidByUserId: alice,
      total: irrMoney(100_000n),
      splits: [
        { userId: alice, amount: irrMoney(40_000n) },
        { userId: bob, amount: irrMoney(60_000n) },
      ],
    }),
  ];
  const series = aggregateBalanceOverTime({
    from: "2026-09-01",
    to: "2026-09-30",
    expenses,
  });
  assert.equal(series.points.length, 1);
  // Alice paid 100k, owes 40k → net +60k; Bob net -60k → credit total 60k
  assert.equal(series.points[0]?.valueMinor, "60000");
});

test("S11-11 personal charts empty and non-empty", () => {
  const emptyIncome = aggregateIncomeVsExpense({ months: 3, txns: [] });
  assert.equal(emptyIncome.points.length, 0);
  assert.ok(emptyIncome.emptyReason);

  const filled = aggregateIncomeVsExpense({
    months: 1,
    asOf: new Date("2026-09-15T00:00:00.000Z"),
    txns: [
      {
        kind: "income",
        occurredOn: "2026-09-01",
        amount: irrMoney(1_000_000n),
      },
      {
        kind: "expense",
        occurredOn: "2026-09-05",
        amount: irrMoney(250_000n),
      },
    ],
  });
  assert.equal(filled.points.length, 1);
  assert.equal(filled.points[0]?.valueMinor, "1000000");
  assert.equal(filled.points[0]?.secondaryMinor, "250000");

  const emptyBurn = aggregateBudgetBurn({ yearMonth: "2026-09", txns: [] });
  assert.equal(emptyBurn.points.length, 0);
  assert.ok(emptyBurn.emptyReason);

  const burn = aggregateBudgetBurn({
    yearMonth: "2026-09",
    budget: {
      id: "b1",
      yearMonth: "2026-09",
      limit: irrMoney(500_000n),
      spent: irrMoney(150_000n),
      remaining: irrMoney(350_000n),
      alertPercent: 80,
      alertLevel: "ok",
      usedPercent: 30,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
    txns: [
      {
        kind: "expense",
        occurredOn: "2026-09-02",
        amount: irrMoney(100_000n),
      },
      {
        kind: "expense",
        occurredOn: "2026-09-03",
        amount: irrMoney(50_000n),
      },
    ],
  });
  assert.equal(burn.points.length, 2);
  assert.equal(burn.points[1]?.tertiaryMinor, "150000");
  assert.equal(burn.points[1]?.secondaryMinor, "500000");

  const emptyGoals = aggregateGoalProgress({ goals: [] });
  assert.ok(emptyGoals.emptyReason);

  const goals = aggregateGoalProgress({
    goals: [
      {
        id: "g1",
        name: "سفر",
        target: irrMoney(1_000_000n),
        contributed: irrMoney(250_000n),
        progressPercent: 25,
        status: "active",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(goals.points[0]?.valueMinor, "250000");
  assert.equal(goals.points[0]?.secondaryMinor, "1000000");
});

test("G14 mergeSumChartSeries sums parts and omits empty", () => {
  const a = aggregateExpenseTrend({
    months: 3,
    asOf: new Date("2026-09-15T00:00:00.000Z"),
    expenses: [
      postedExpense({
        id: "e1",
        occurredOn: "2026-09-01",
        total: irrMoney(100_000n),
        paidByUserId: alice,
        splits: [{ userId: alice, amount: irrMoney(100_000n) }],
      }),
    ],
  });
  const b = aggregateExpenseTrend({
    months: 3,
    asOf: new Date("2026-09-15T00:00:00.000Z"),
    expenses: [
      postedExpense({
        id: "e2",
        occurredOn: "2026-09-02",
        total: irrMoney(50_000n),
        paidByUserId: bob,
        splits: [{ userId: bob, amount: irrMoney(50_000n) }],
      }),
    ],
  });
  const merged = mergeSumChartSeries(
    [
      { label: "ws-a", series: a },
      { label: "ws-b", series: b },
    ],
    "expense-trend",
  );
  assert.equal(merged.points.find((p) => p.key === "2026-09")?.valueMinor, "150000");
  assert.match(merged.source ?? "", /merged:/);

  const empty = mergeSumChartSeries([], "expense-trend");
  assert.equal(empty.points.length, 0);
  assert.ok(empty.emptyReason);
});

test("G14 defaultChartDateRange is inclusive window", () => {
  const { from, to } = defaultChartDateRange(10, new Date("2026-09-10T12:00:00.000Z"));
  assert.equal(to, "2026-09-10");
  assert.equal(from, "2026-09-01");
});

test("chartMonthKeys returns contiguous months", () => {
  const keys = chartMonthKeys(3, new Date("2026-09-15T00:00:00.000Z"));
  assert.deepEqual(keys, ["2026-07", "2026-08", "2026-09"]);
});
