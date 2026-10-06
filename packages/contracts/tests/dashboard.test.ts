import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateExpenseSpendInRange,
  buildWorkspaceMoneyPulse,
  computeSavingsRatePercent,
  countExpensesByStatus,
  defaultDashboardDateRange,
  evaluateIncomeSaveTarget,
  moneyPulseFlowSeries,
} from "../src/dashboard.js";

test("countExpensesByStatus aggregates statuses", () => {
  const counts = countExpensesByStatus([
    { status: "posted" },
    { status: "draft" },
    { status: "posted" },
    { status: "submitted" },
  ]);
  assert.equal(counts.posted, 2);
  assert.equal(counts.draft, 1);
  assert.equal(counts.submitted, 1);
  assert.equal(counts.reversed, undefined);
});

test("aggregateExpenseSpendInRange filters by occurredOn and sums posted", () => {
  const result = aggregateExpenseSpendInRange(
    [
      {
        status: "posted",
        occurredOn: "2026-03-10",
        total: { amountMinor: "1000", currency: "IRR" },
      },
      {
        status: "posted",
        occurredOn: "2026-02-01",
        total: { amountMinor: "5000", currency: "IRR" },
      },
      {
        status: "draft",
        occurredOn: "2026-03-15",
        total: { amountMinor: "2000", currency: "IRR" },
      },
      {
        status: "submitted",
        occurredOn: "2026-03-20",
        total: { amountMinor: "3000", currency: "IRR" },
      },
    ],
    "2026-03-01",
    "2026-03-31",
  );
  assert.equal(result.postedCount, 1);
  assert.equal(result.postedTotal.amountMinor, "1000");
  assert.equal(result.draftCount, 1);
  assert.equal(result.expenseCountByStatus.posted, 1);
  assert.equal(result.expenseCountByStatus.draft, 1);
  assert.equal(result.expenseCountByStatus.submitted, 1);
  assert.equal(result.expenseCountByStatus.reversed, undefined);
});

test("defaultDashboardDateRange uses UTC month start and today", () => {
  const range = defaultDashboardDateRange(new Date("2026-09-06T15:30:00.000Z"));
  assert.equal(range.from, "2026-09-01");
  assert.equal(range.to, "2026-09-06");
});

test("buildWorkspaceMoneyPulse is honest for group without personal income", () => {
  const pulse = buildWorkspaceMoneyPulse({
    spaceKind: "group",
    postedSpend: { amountMinor: "10000", currency: "IRR" },
    openSettlementTotal: { amountMinor: "2000", currency: "IRR" },
    movements: [],
  });
  assert.equal(pulse.income.amountMinor, "0");
  assert.equal(pulse.expense.amountMinor, "10000");
  assert.equal(pulse.net.amountMinor, "-10000");
  assert.equal(pulse.allocated.amountMinor, "2000");
  assert.equal(pulse.scope, "workspace");
  assert.equal(pulse.savingsRatePercent, null);
  assert.equal(pulse.allocation.liquid.amountMinor, "0");
  assert.ok(pulse.notes.some((n) => n.includes("درآمد فضای کاری مدل نشده")));
});

test("buildWorkspaceMoneyPulse links personal income for personal space", () => {
  const pulse = buildWorkspaceMoneyPulse({
    spaceKind: "personal",
    postedSpend: { amountMinor: "1000", currency: "IRR" },
    openSettlementTotal: { amountMinor: "0", currency: "IRR" },
    personalIncomeMinor: 5000n,
    personalExpenseMinor: 500n,
    goalsContributedMinor: 2000n,
    movements: [
      {
        id: "m1",
        kind: "income",
        title: "حقوق",
        amount: { amountMinor: "5000", currency: "IRR" },
        direction: "in",
        occurredOn: "2026-09-01",
        hrefHint: "me-finance",
      },
    ],
  });
  assert.equal(pulse.income.amountMinor, "5000");
  assert.equal(pulse.expense.amountMinor, "1500");
  assert.equal(pulse.net.amountMinor, "3500");
  assert.equal(pulse.allocated.amountMinor, "2000");
  assert.equal(pulse.allocation.goals.amountMinor, "2000");
  assert.equal(pulse.allocation.liquid.amountMinor, "0");
  assert.equal(pulse.allocation.investments.amountMinor, "0");
  assert.equal(pulse.allocation.installments.amountMinor, "0");
  assert.equal(pulse.savingsRatePercent, 70);
  assert.equal(pulse.intents.length, 0);
  assert.equal(pulse.goals.length, 0);
  assert.equal(pulse.counts.income, 1);
  assert.equal(pulse.scope, "personal_linked");
  assert.equal(pulse.movements.length, 1);
});

test("moneyPulseFlowSeries builds IRR dual series from real movements", () => {
  const series = moneyPulseFlowSeries([
    {
      id: "i1",
      kind: "income",
      title: "حقوق",
      amount: { amountMinor: "10000", currency: "IRR" },
      direction: "in",
      occurredOn: "2026-09-02",
      hrefHint: "me-finance",
    },
    {
      id: "e1",
      kind: "expense",
      title: "خرید",
      amount: { amountMinor: "3000", currency: "IRR" },
      direction: "out",
      occurredOn: "2026-09-05",
      hrefHint: "expenses",
    },
    {
      id: "e2",
      kind: "expense",
      title: "قبلی",
      amount: { amountMinor: "1000", currency: "IRR" },
      direction: "out",
      occurredOn: "2026-08-20",
      hrefHint: "expenses",
    },
  ]);
  assert.equal(series.chart, "income-vs-expense");
  assert.equal(series.currency, "IRR");
  assert.equal(series.points.length, 2);
  assert.equal(series.points[0]?.key, "2026-08");
  assert.equal(series.points[0]?.secondaryMinor, "1000");
  assert.equal(series.points[1]?.key, "2026-09");
  assert.equal(series.points[1]?.valueMinor, "10000");
  assert.equal(series.points[1]?.secondaryMinor, "3000");
});

test("computeSavingsRatePercent and evaluateIncomeSaveTarget are honest", () => {
  assert.equal(computeSavingsRatePercent(0n, 0n), null);
  assert.equal(computeSavingsRatePercent(10000n, 2500n), 25);
  const hit = evaluateIncomeSaveTarget({
    incomeMinor: 10000n,
    netMinor: 1200n,
    targetIncomeSavePercent: 10,
  });
  assert.ok(hit);
  assert.equal(hit.met, true);
  assert.equal(hit.actualPercent, 12);
  const miss = evaluateIncomeSaveTarget({
    incomeMinor: 10000n,
    netMinor: 500n,
    targetIncomeSavePercent: 10,
  });
  assert.ok(miss);
  assert.equal(miss.met, false);
  assert.equal(miss.gapMinor, "500");
});

test("buildWorkspaceMoneyPulse surfaces goal snaps, liquid, and intents", () => {
  const pulse = buildWorkspaceMoneyPulse({
    spaceKind: "personal",
    postedSpend: { amountMinor: "0", currency: "IRR" },
    openSettlementTotal: { amountMinor: "0", currency: "IRR" },
    personalIncomeMinor: 10000n,
    personalExpenseMinor: 2000n,
    goalsContributedMinor: 3000n,
    liquidBalanceMinor: 50000n,
    moneyIntents: [
      {
        id: "i1",
        name: "پس‌انداز ماه",
        kind: "save_income_percent",
        period: "month",
        targetPercent: 10,
        active: true,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    goals: [
      {
        id: "g1",
        name: "صندوق اضطراری",
        target: { amountMinor: "100000", currency: "IRR" },
        contributed: { amountMinor: "3000", currency: "IRR" },
        progressPercent: 3,
        status: "active",
      },
    ],
    movements: [],
  });
  assert.equal(pulse.savingsRatePercent, 80);
  assert.equal(pulse.goals.length, 1);
  assert.equal(pulse.allocation.liquid.amountMinor, "50000");
  assert.equal(pulse.intents.length, 1);
  assert.equal(pulse.intents[0]?.met, true);
  assert.ok(pulse.notes.some((n) => n.includes("برآورده شده")));
});

test("buildWorkspaceMoneyPulse tracks investment and installment buckets", () => {
  const pulse = buildWorkspaceMoneyPulse({
    spaceKind: "personal",
    postedSpend: { amountMinor: "0", currency: "IRR" },
    openSettlementTotal: { amountMinor: "0", currency: "IRR" },
    personalIncomeMinor: 20000n,
    personalExpenseMinor: 5000n,
    personalInvestmentMinor: 3000n,
    personalInstallmentMinor: 2000n,
    movements: [
      {
        id: "inv1",
        kind: "investment",
        title: "صندوق",
        amount: { amountMinor: "3000", currency: "IRR" },
        direction: "out",
        occurredOn: "2026-09-10",
        hrefHint: "me-finance",
      },
      {
        id: "ins1",
        kind: "installment",
        title: "قسط خودرو",
        amount: { amountMinor: "2000", currency: "IRR" },
        direction: "out",
        occurredOn: "2026-09-12",
        hrefHint: "me-finance",
      },
    ],
  });
  assert.equal(pulse.allocation.investments.amountMinor, "3000");
  assert.equal(pulse.allocation.installments.amountMinor, "2000");
  assert.equal(pulse.counts.investment, 1);
  assert.equal(pulse.counts.installment, 1);
});
