/**
 * Chart series contracts (S11-11).
 * Points are always real aggregates — never decorative zeros.
 */

import { computeProvisionalBalances, type ExpenseSummary } from "./finance.js";
import type { AnalyticsDailySpendFact } from "./analytics-warehouse.js";
import type {
  MonthlyCloseSummary,
  PersonalBudgetSummary,
  PersonalMoneyTxnSummary,
  SavingsGoalSummary,
} from "./personal-finance.js";

export type ChartKind =
  | "expense-trend"
  | "member-share"
  | "category-mix"
  | "balance-over-time"
  | "income-vs-expense"
  | "budget-burn"
  | "goal-progress";

export type ChartPoint = {
  /** Stable key (month, day, userId, categoryId, goalId). */
  key: string;
  /** Human-facing label (may equal key when no better label). */
  label: string;
  /** Primary value in IRR minor. */
  valueMinor: string;
  /** Optional secondary (e.g. expense beside income, budget limit). */
  secondaryMinor?: string;
  /** Optional tertiary (e.g. cumulative burn). */
  tertiaryMinor?: string;
};

export type ChartSeriesResponse = {
  chart: ChartKind;
  currency: "IRR";
  from?: string;
  to?: string;
  yearMonth?: string;
  months?: number;
  source: string;
  points: ChartPoint[];
  /** Present when points is empty — honest empty state for UI. */
  emptyReason?: string;
};

export const CHARTS_PROVIDER = "charts_v1" as const;

const EMPTY_NO_EXPENSE = "خرج ثبت‌شده‌ای در این بازه نیست";
const EMPTY_NO_TXN = "تراکنش شخصی در این بازه ثبت نشده است";
const EMPTY_NO_BUDGET = "بودجه ماهانه برای این ماه تعریف نشده است";
const EMPTY_NO_GOALS = "هدف پس‌اندازی ثبت نشده است";
const EMPTY_NO_CLOSE = "تحلیل ماه برای این بازه موجود نیست";

function parseMinor(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function clampMonths(months: number | undefined): number {
  if (months == null || !Number.isFinite(months)) return 6;
  return Math.min(36, Math.max(1, Math.floor(months)));
}

/** Last `months` calendar months ending at `asOf` (YYYY-MM-DD), inclusive. */
export function chartMonthKeys(months: number, asOf = new Date()): string[] {
  const n = clampMonths(months);
  const keys: string[] = [];
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth(); // 0-based
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    keys.push(ym);
  }
  return keys;
}

function monthOf(day: string): string {
  return day.slice(0, 7);
}

function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

function isPostedShared(expense: Pick<ExpenseSummary, "status" | "visibility">): boolean {
  return expense.status === "posted" && expense.visibility !== "private";
}

/**
 * Prefer analytics warehouse daily facts when present; else posted expenses.
 * Months with zero spend are omitted (no fake zeros).
 */
export function aggregateExpenseTrend(input: {
  months?: number;
  asOf?: Date;
  facts?: readonly AnalyticsDailySpendFact[];
  expenses?: readonly Pick<
    ExpenseSummary,
    "status" | "visibility" | "occurredOn" | "total"
  >[];
}): Omit<ChartSeriesResponse, "chart"> & { chart: "expense-trend" } {
  const months = clampMonths(input.months);
  const keys = new Set(chartMonthKeys(months, input.asOf));
  const buckets = new Map<string, bigint>();

  const facts = input.facts ?? [];
  if (facts.length > 0) {
    for (const fact of facts) {
      const ym = monthOf(fact.day);
      if (!keys.has(ym)) continue;
      buckets.set(ym, (buckets.get(ym) ?? 0n) + parseMinor(fact.totalMinor));
    }
    const points: ChartPoint[] = [...buckets.entries()]
      .filter(([, v]) => v > 0n)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        label: key,
        valueMinor: value.toString(),
      }));
    return {
      chart: "expense-trend",
      currency: "IRR",
      months,
      source: "analytics_daily_facts",
      points,
      emptyReason: points.length === 0 ? EMPTY_NO_EXPENSE : undefined,
    };
  }

  for (const expense of input.expenses ?? []) {
    if (!isPostedShared(expense)) continue;
    if (expense.total.currency !== "IRR") continue;
    const ym = monthOf(expense.occurredOn);
    if (!keys.has(ym)) continue;
    const amount = parseMinor(expense.total.amountMinor);
    if (amount <= 0n) continue;
    buckets.set(ym, (buckets.get(ym) ?? 0n) + amount);
  }
  const points: ChartPoint[] = [...buckets.entries()]
    .filter(([, v]) => v > 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: key,
      valueMinor: value.toString(),
    }));
  return {
    chart: "expense-trend",
    currency: "IRR",
    months,
    source: "expenses_posted",
    points,
    emptyReason: points.length === 0 ? EMPTY_NO_EXPENSE : undefined,
  };
}

/** Member share = sum of split lines in range (posted, non-private). */
export function aggregateMemberShare(input: {
  from: string;
  to: string;
  expenses: readonly Pick<
    ExpenseSummary,
    "status" | "visibility" | "occurredOn" | "splits"
  >[];
  /** Optional IAM display names; missing keys fall back to userId. */
  memberLabels?: ReadonlyMap<string, string>;
}): Omit<ChartSeriesResponse, "chart"> & { chart: "member-share" } {
  const buckets = new Map<string, bigint>();
  for (const expense of input.expenses) {
    if (!isPostedShared(expense)) continue;
    if (!inRange(expense.occurredOn, input.from, input.to)) continue;
    for (const line of expense.splits) {
      if (line.amount.currency !== "IRR") continue;
      const amount = parseMinor(line.amount.amountMinor);
      if (amount <= 0n) continue;
      buckets.set(line.userId, (buckets.get(line.userId) ?? 0n) + amount);
    }
  }
  const points: ChartPoint[] = [...buckets.entries()]
    .filter(([, v]) => v > 0n)
    .sort((a, b) => {
      if (a[1] === b[1]) return a[0].localeCompare(b[0]);
      return a[1] > b[1] ? -1 : 1;
    })
    .map(([key, value]) => ({
      key,
      label: input.memberLabels?.get(key) ?? key,
      valueMinor: value.toString(),
    }));
  return {
    chart: "member-share",
    currency: "IRR",
    from: input.from,
    to: input.to,
    source: "expense_splits",
    points,
    emptyReason: points.length === 0 ? EMPTY_NO_EXPENSE : undefined,
  };
}

/** Category mix from posted expenses; missing category → بدون دسته. */
export function aggregateCategoryMix(input: {
  from: string;
  to: string;
  expenses: readonly Pick<
    ExpenseSummary,
    "status" | "visibility" | "occurredOn" | "total" | "categoryId"
  >[];
  categoryLabels?: ReadonlyMap<string, string>;
}): Omit<ChartSeriesResponse, "chart"> & { chart: "category-mix" } {
  const buckets = new Map<string, bigint>();
  for (const expense of input.expenses) {
    if (!isPostedShared(expense)) continue;
    if (!inRange(expense.occurredOn, input.from, input.to)) continue;
    if (expense.total.currency !== "IRR") continue;
    const amount = parseMinor(expense.total.amountMinor);
    if (amount <= 0n) continue;
    const key = expense.categoryId?.trim() || "uncategorized";
    buckets.set(key, (buckets.get(key) ?? 0n) + amount);
  }
  const points: ChartPoint[] = [...buckets.entries()]
    .filter(([, v]) => v > 0n)
    .sort((a, b) => {
      if (a[1] === b[1]) return a[0].localeCompare(b[0]);
      return a[1] > b[1] ? -1 : 1;
    })
    .map(([key, value]) => ({
      key,
      label:
        key === "uncategorized"
          ? "بدون دسته"
          : (input.categoryLabels?.get(key) ?? key),
      valueMinor: value.toString(),
    }));
  return {
    chart: "category-mix",
    currency: "IRR",
    from: input.from,
    to: input.to,
    source: "expenses_posted",
    points,
    emptyReason: points.length === 0 ? EMPTY_NO_EXPENSE : undefined,
  };
}

/**
 * Outstanding credit total (sum of positive nets) per day that has activity.
 * Built from posted expenses via provisional balance math — no invented numbers.
 */
export function aggregateBalanceOverTime(input: {
  from: string;
  to: string;
  expenses: readonly Pick<
    ExpenseSummary,
    | "id"
    | "status"
    | "occurredOn"
    | "paidByUserId"
    | "total"
    | "paymentLines"
    | "splits"
  >[];
}): Omit<ChartSeriesResponse, "chart"> & { chart: "balance-over-time" } {
  const days = new Set<string>();
  for (const expense of input.expenses) {
    if (expense.status !== "posted") continue;
    if (!inRange(expense.occurredOn, input.from, input.to)) continue;
    days.add(expense.occurredOn);
  }
  const sortedDays = [...days].sort((a, b) => a.localeCompare(b));
  const points: ChartPoint[] = [];
  for (const day of sortedDays) {
    const slice = input.expenses.filter(
      (e) => e.status === "posted" && e.occurredOn <= day,
    );
    const lines = computeProvisionalBalances(slice, []);
    let credit = 0n;
    for (const line of lines) {
      const net = parseMinor(line.net.amountMinor);
      if (net > 0n) credit += net;
    }
    if (credit <= 0n) continue;
    points.push({
      key: day,
      label: day,
      valueMinor: credit.toString(),
    });
  }
  return {
    chart: "balance-over-time",
    currency: "IRR",
    from: input.from,
    to: input.to,
    source: "expense_provisional_balances",
    points,
    emptyReason: points.length === 0 ? EMPTY_NO_EXPENSE : undefined,
  };
}

/** Prefer monthly_close rows; else aggregate money_txn by month. */
export function aggregateIncomeVsExpense(input: {
  months?: number;
  asOf?: Date;
  closes?: readonly MonthlyCloseSummary[];
  txns?: readonly Pick<PersonalMoneyTxnSummary, "kind" | "occurredOn" | "amount">[];
}): Omit<ChartSeriesResponse, "chart"> & { chart: "income-vs-expense" } {
  const months = clampMonths(input.months);
  const keys = chartMonthKeys(months, input.asOf);
  const keySet = new Set(keys);

  if (input.closes && input.closes.length > 0) {
    const byMonth = new Map(input.closes.map((c) => [c.yearMonth, c]));
    const points: ChartPoint[] = [];
    for (const ym of keys) {
      const close = byMonth.get(ym);
      if (!close || close.empty) continue;
      const income = parseMinor(close.income.amountMinor);
      const expense = parseMinor(close.expense.amountMinor);
      if (income === 0n && expense === 0n) continue;
      points.push({
        key: ym,
        label: ym,
        valueMinor: income.toString(),
        secondaryMinor: expense.toString(),
      });
    }
    return {
      chart: "income-vs-expense",
      currency: "IRR",
      months,
      source: "monthly_close",
      points,
      emptyReason: points.length === 0 ? EMPTY_NO_CLOSE : undefined,
    };
  }

  const incomeBuckets = new Map<string, bigint>();
  const expenseBuckets = new Map<string, bigint>();
  for (const txn of input.txns ?? []) {
    const ym = monthOf(txn.occurredOn);
    if (!keySet.has(ym)) continue;
    if (txn.amount.currency !== "IRR") continue;
    const amount = parseMinor(txn.amount.amountMinor);
    if (amount <= 0n) continue;
    if (txn.kind === "income") {
      incomeBuckets.set(ym, (incomeBuckets.get(ym) ?? 0n) + amount);
    } else if (txn.kind === "expense") {
      expenseBuckets.set(ym, (expenseBuckets.get(ym) ?? 0n) + amount);
    }
  }
  const points: ChartPoint[] = [];
  for (const ym of keys) {
    const income = incomeBuckets.get(ym) ?? 0n;
    const expense = expenseBuckets.get(ym) ?? 0n;
    if (income === 0n && expense === 0n) continue;
    points.push({
      key: ym,
      label: ym,
      valueMinor: income.toString(),
      secondaryMinor: expense.toString(),
    });
  }
  return {
    chart: "income-vs-expense",
    currency: "IRR",
    months,
    source: "money_txn",
    points,
    emptyReason: points.length === 0 ? EMPTY_NO_TXN : undefined,
  };
}

/**
 * Budget burn within a month: daily expense totals + cumulative vs limit.
 * Empty when no budget and no expense txns for the month.
 */
export function aggregateBudgetBurn(input: {
  yearMonth: string;
  budget?: PersonalBudgetSummary | null;
  txns: readonly Pick<PersonalMoneyTxnSummary, "kind" | "occurredOn" | "amount">[];
}): Omit<ChartSeriesResponse, "chart"> & { chart: "budget-burn" } {
  const prefix = input.yearMonth;
  const daily = new Map<string, bigint>();
  for (const txn of input.txns) {
    if (txn.kind !== "expense") continue;
    if (!txn.occurredOn.startsWith(prefix)) continue;
    if (txn.amount.currency !== "IRR") continue;
    const amount = parseMinor(txn.amount.amountMinor);
    if (amount <= 0n) continue;
    daily.set(txn.occurredOn, (daily.get(txn.occurredOn) ?? 0n) + amount);
  }
  const limit = input.budget ? parseMinor(input.budget.limit.amountMinor) : 0n;
  const days = [...daily.keys()].sort((a, b) => a.localeCompare(b));
  let cumulative = 0n;
  const points: ChartPoint[] = [];
  for (const day of days) {
    const daySpend = daily.get(day) ?? 0n;
    cumulative += daySpend;
    points.push({
      key: day,
      label: day,
      valueMinor: daySpend.toString(),
      secondaryMinor: limit > 0n ? limit.toString() : undefined,
      tertiaryMinor: cumulative.toString(),
    });
  }
  if (points.length === 0) {
    return {
      chart: "budget-burn",
      currency: "IRR",
      yearMonth: input.yearMonth,
      source: input.budget ? "budget_and_money_txn" : "money_txn",
      points: [],
      emptyReason: input.budget ? EMPTY_NO_TXN : EMPTY_NO_BUDGET,
    };
  }
  return {
    chart: "budget-burn",
    currency: "IRR",
    yearMonth: input.yearMonth,
    source: input.budget ? "budget_and_money_txn" : "money_txn",
    points,
  };
}

/** Goal progress from contributed vs target — never a stored progress field. */
export function aggregateGoalProgress(input: {
  goals: readonly SavingsGoalSummary[];
}): Omit<ChartSeriesResponse, "chart"> & { chart: "goal-progress" } {
  const points: ChartPoint[] = input.goals
    .filter((g) => g.status !== "archived")
    .map((g) => ({
      key: g.id,
      label: g.name,
      valueMinor: g.contributed.amountMinor,
      secondaryMinor: g.target.amountMinor,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fa"));
  return {
    chart: "goal-progress",
    currency: "IRR",
    source: "savings_contributions",
    points,
    emptyReason: points.length === 0 ? EMPTY_NO_GOALS : undefined,
  };
}

/** Default from/to window ending today (UTC), inclusive. */
export function defaultChartDateRange(daysBack = 90, asOf = new Date()): {
  from: string;
  to: string;
} {
  const to = asOf.toISOString().slice(0, 10);
  const start = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - Math.max(1, daysBack) + 1);
  const from = start.toISOString().slice(0, 10);
  return { from, to };
}

function chartPointMinor(point: ChartPoint): bigint {
  try {
    return BigInt(point.valueMinor);
  } catch {
    return 0n;
  }
}

/**
 * Sum expense-trend (or similar single-value monthly series) across workspaces.
 * Months with zero total are omitted — no decorative zeros.
 */
export function mergeSumChartSeries(
  parts: readonly { label: string; series: ChartSeriesResponse }[],
  chart: ChartSeriesResponse["chart"] = "expense-trend",
): ChartSeriesResponse {
  const buckets = new Map<string, { label: string; value: bigint }>();
  const sourceParts: string[] = [];
  for (const part of parts) {
    if (part.series.points.length === 0) continue;
    sourceParts.push(part.label);
    for (const point of part.series.points) {
      const prev = buckets.get(point.key);
      const add = chartPointMinor(point);
      if (add <= 0n) continue;
      if (prev) {
        prev.value += add;
      } else {
        buckets.set(point.key, { label: point.label, value: add });
      }
    }
  }
  const points: ChartPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, v]) => v.value > 0n)
    .map(([key, v]) => ({
      key,
      label: v.label,
      valueMinor: v.value.toString(),
    }));
  return {
    chart,
    currency: "IRR",
    source:
      sourceParts.length > 0
        ? `merged:${sourceParts.slice(0, 6).join("+")}${sourceParts.length > 6 ? "+…" : ""}`
        : "merged:empty",
    points,
    emptyReason:
      points.length === 0 ? "در این حوزه هنوز خرج ثبت‌شده‌ای برای نمودار نیست" : undefined,
  };
}

/** Cross-workspace chart aggregate for one {@link SpaceKind} (G07). */
export type KindChartsAggregateResponse = {
  kind: "personal" | "group" | "building" | "org";
  months: number;
  expenseTrend: ChartSeriesResponse;
  categoryMix: ChartSeriesResponse;
  spaces: Array<{
    workspaceId: string;
    slug: string;
    name: string;
    expenseTrend: ChartSeriesResponse;
  }>;
};
