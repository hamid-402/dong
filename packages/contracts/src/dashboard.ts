import type { Money } from "./money.js";
import type { ChartSeriesResponse } from "./charts.js";
import {
  evaluateActiveMoneyIntents,
  type MoneyIntentEvaluation,
  type MoneyIntentSummary,
} from "./money-intent.js";
import { irrMoney, zeroIrr, type PersonalFinanceOverviewResponse } from "./personal-finance.js";

export type WorkspaceDashboardResponse = {
  workspaceId: string;
  workspaceName: string;
  from: string; // YYYY-MM-DD
  to: string;
  actorNet: Money; // actor's balance line net
  spend: {
    postedTotal: Money;
    postedCount: number;
    draftCount: number;
    expenseCountByStatus: Partial<Record<string, number>>;
  };
  settlements: {
    openCount: number; // claimed + disputed
    disputedCount: number;
    openTotal: Money; // sum amounts of open
  };
  activity: {
    unreadNotifications: number;
    memberCount: number;
    recentExpenses: Array<{
      id: string;
      title: string;
      total: Money;
      status: string;
      occurredOn: string;
    }>; // max 5, newest first from list
  };
  balances: {
    zeroSum: boolean;
    provisional: boolean;
    source: string;
  };
  /**
   * Home money command pulse — aggregates for click-through tiles.
   * Always present; zeros + notes when a stream has no backing data.
   */
  moneyPulse: WorkspaceMoneyPulse;
  source: {
    expense: "memory" | "postgres";
    ledger: "memory" | "postgres";
    settlement: "memory" | "postgres";
    notification: "memory" | "postgres";
    personal?: "memory" | "postgres";
  };
};

/** One row in the home money drill-down list. */
export type WorkspaceMoneyMovement = {
  id: string;
  kind: "income" | "expense" | "settlement" | "contribution" | "transfer" | "investment" | "installment";
  title: string;
  amount: Money;
  /** Sign for display: inflow positive, outflow negative convention in UI. */
  direction: "in" | "out";
  occurredOn: string;
  /** Client route hint — never a fake deep link. */
  hrefHint: "expenses" | "settlements" | "me-finance" | "ledger" | "charts";
};

/** Slim goal row for home command — store-backed progress only. */
export type WorkspaceMoneyGoalSnap = {
  id: string;
  name: string;
  target: Money;
  contributed: Money;
  progressPercent: number;
  status: "active" | "reached" | "archived";
};

export type WorkspaceMoneyPulse = {
  income: Money;
  expense: Money;
  /** income − expense (may be negative). */
  net: Money;
  /**
   * Allocated to savings goals (cumulative contributed) and/or open settlement
   * total — see `notes` for which streams contributed.
   */
  allocated: Money;
  /** Split of allocated / liquid — store-backed; zeros when absent. */
  allocation: {
    goals: Money;
    settlements: Money;
    /** Sum of personal money-account balances when resources store is live. */
    liquid: Money;
    /** Personal investment outflows in range (money_txn.investment). */
    investments: Money;
    /** Personal installment/loan payments in range (money_txn.installment). */
    installments: Money;
  };
  /**
   * Net ÷ income × 100 for this range — null when income is zero
   * (never invent a decorative 0%).
   */
  savingsRatePercent: number | null;
  /** Active/reached goals (max ~8) for home progress — empty when none. */
  goals: WorkspaceMoneyGoalSnap[];
  /**
   * Evaluated user-configured money intents/rules for this range.
   * Empty when none configured — never invent sample rules.
   */
  intents: MoneyIntentEvaluation[];
  counts: {
    income: number;
    expense: number;
    settlement: number;
    contribution: number;
    transfer: number;
    investment: number;
    installment: number;
  };
  movements: WorkspaceMoneyMovement[];
  /** personal_linked = income/expense also include personal money_txn for this actor. */
  scope: "workspace" | "personal_linked";
  notes: string[];
};

export type PersonalDashboardResponse = {
  from: string;
  to: string;
  finance: PersonalFinanceOverviewResponse;
  workspaceCount: number;
  source: PersonalFinanceOverviewResponse["source"];
};

/** Count expenses by status string (pure; no date filter). */
export function countExpensesByStatus(
  expenses: readonly { status: string }[],
): Partial<Record<string, number>> {
  const counts: Partial<Record<string, number>> = {};
  for (const expense of expenses) {
    const key = expense.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Aggregate spend stats for expenses whose occurredOn is in [from, to] inclusive.
 */
export function aggregateExpenseSpendInRange(
  expenses: readonly {
    status: string;
    occurredOn: string;
    total: Money;
  }[],
  from: string,
  to: string,
): {
  postedTotal: Money;
  postedCount: number;
  draftCount: number;
  expenseCountByStatus: Partial<Record<string, number>>;
} {
  const inRange = expenses.filter(
    (e) => e.occurredOn >= from && e.occurredOn <= to,
  );
  const expenseCountByStatus = countExpensesByStatus(inRange);
  let postedTotal = 0n;
  let postedCount = 0;
  let draftCount = 0;
  for (const expense of inRange) {
    if (expense.status === "posted") {
      postedCount += 1;
      postedTotal += BigInt(expense.total.amountMinor);
    } else if (expense.status === "draft") {
      draftCount += 1;
    }
  }
  return {
    postedTotal: postedCount === 0 && postedTotal === 0n ? zeroIrr() : irrMoney(postedTotal),
    postedCount,
    draftCount,
    expenseCountByStatus,
  };
}

/** UTC calendar month start → today (YYYY-MM-DD). */
export function defaultDashboardDateRange(now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}


/** Actual savings rate from income/net — null when income ≤ 0. */
export function computeSavingsRatePercent(
  incomeMinor: bigint,
  netMinor: bigint,
): number | null {
  if (incomeMinor <= 0n) return null;
  return Math.round(Number((netMinor * 10000n) / incomeMinor) / 100);
}

/**
 * Compare actual savings rate to a configured % of income target.
 * Returns null when income is 0 or target is not a positive percent.
 */
export function evaluateIncomeSaveTarget(input: {
  incomeMinor: bigint;
  netMinor: bigint;
  targetIncomeSavePercent: number;
}): {
  actualPercent: number;
  targetPercent: number;
  met: boolean;
  /** Extra IRR minor needed this period to hit target (0 when met). */
  gapMinor: string;
} | null {
  const target = Math.floor(input.targetIncomeSavePercent);
  if (input.incomeMinor <= 0n || !Number.isFinite(target) || target < 1 || target > 100) {
    return null;
  }
  const actual = computeSavingsRatePercent(input.incomeMinor, input.netMinor);
  if (actual == null) return null;
  const need = (input.incomeMinor * BigInt(target)) / 100n;
  const saved = input.netMinor > 0n ? input.netMinor : 0n;
  const gap = need > saved ? need - saved : 0n;
  return {
    actualPercent: actual,
    targetPercent: target,
    met: actual >= target,
    gapMinor: gap.toString(),
  };
}

/**
 * Build home money pulse from store-backed slices (pure).
 * Does not invent income for group/org workspaces without personal txns.
 */
export function buildWorkspaceMoneyPulse(input: {
  spaceKind: "personal" | "group" | "building" | "org";
  postedSpend: Money;
  openSettlementTotal: Money;
  personalIncomeMinor?: bigint;
  personalExpenseMinor?: bigint;
  /** Cumulative savings-goal contributions (all-time progress). */
  goalsContributedMinor?: bigint;
  /** Personal account balances sum (resources store). */
  liquidBalanceMinor?: bigint;
  personalInvestmentMinor?: bigint;
  personalInstallmentMinor?: bigint;
  /** Active goals for home progress bars. */
  goals?: WorkspaceMoneyGoalSnap[];
  /** User-configured intents — evaluated against this pulse's live numbers. */
  moneyIntents?: readonly MoneyIntentSummary[];
  movements: WorkspaceMoneyMovement[];
}): WorkspaceMoneyPulse {
  const notes: string[] = [];
  const personalIncome = input.personalIncomeMinor ?? 0n;
  const personalExpense = input.personalExpenseMinor ?? 0n;
  const workspaceSpend = BigInt(input.postedSpend.amountMinor);
  const linked = personalIncome > 0n || personalExpense > 0n;

  let incomeMinor = personalIncome;
  let expenseMinor = workspaceSpend;

  if (input.spaceKind === "personal") {
    expenseMinor = workspaceSpend + personalExpense;
    if (personalIncome === 0n) {
      notes.push("هنوز درآمد شخصی در بازه ثبت نشده");
    }
  } else if (linked) {
    incomeMinor = personalIncome;
    expenseMinor = workspaceSpend + personalExpense;
    notes.push("درآمد/خرج شخصی لینک‌شده در کنار خرج فضای کاری جمع شده");
  } else {
    notes.push("درآمد فضای کاری مدل نشده — فقط خرج مشترک و مانده اعضا");
  }

  const goals = input.goalsContributedMinor ?? 0n;
  const openSettle = BigInt(input.openSettlementTotal.amountMinor);
  const liquid = input.liquidBalanceMinor ?? 0n;
  const investments = input.personalInvestmentMinor ?? 0n;
  const installments = input.personalInstallmentMinor ?? 0n;
  let allocatedMinor = goals;
  if (goals > 0n) notes.push("تخصیص‌شده شامل جمع مشارکت اهداف پس‌انداز است");
  if (openSettle > 0n) {
    allocatedMinor += openSettle;
    notes.push("تخصیص‌شده شامل مبلغ تسویه‌های باز / بدهی بین‌نفر است");
  }
  if (investments > 0n) {
    allocatedMinor += investments;
    notes.push("تخصیص‌شده شامل سرمایه‌گذاری ثبت‌شده در بازه است");
  }
  if (installments > 0n) {
    notes.push("اقساط ثبت‌شده در بازه جدا از خرج روزمره شمرده شده");
  }
  if (liquid > 0n) {
    notes.push("مانده حساب‌های شخصی از منابع واقعی خوانده شده");
  }
  if (allocatedMinor === 0n && liquid === 0n && installments === 0n) {
    notes.push("هنوز تخصیص پس‌انداز/سرمایه یا تسویه باز ثبت نشده");
  }

  const netMinor = incomeMinor - expenseMinor;
  const savingsRatePercent = computeSavingsRatePercent(incomeMinor, netMinor);
  const goalSnaps = (input.goals ?? [])
    .filter((g) => g.status !== "archived")
    .slice(0, 8);

  const intents = evaluateActiveMoneyIntents(input.moneyIntents ?? [], {
    incomeMinor,
    expenseMinor,
    netMinor,
    liquidMinor: liquid,
    openSettleMinor: openSettle,
    installmentMinor: installments,
    investmentMinor: investments,
    goals: goalSnaps.map((g) => ({
      id: g.id,
      name: g.name,
      progressPercent: g.progressPercent,
      target: g.target,
      contributed: g.contributed,
    })),
  });
  const unmet = intents.filter((i) => i.met === false).length;
  const metCount = intents.filter((i) => i.met === true).length;
  if (intents.length > 0) {
    notes.push(
      unmet > 0
        ? `${unmet.toLocaleString("fa-IR")} قاعده/هدف بازه هنوز برآورده نشده`
        : metCount > 0
          ? `${metCount.toLocaleString("fa-IR")} قاعده/هدف بازه برآورده شده`
          : `${intents.length.toLocaleString("fa-IR")} قاعده فعال (هنوز غیرقابل سنجش)`,
    );
  }

  const movements = [...input.movements]
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    .slice(0, 40);

  const counts = {
    income: 0,
    expense: 0,
    settlement: 0,
    contribution: 0,
    transfer: 0,
    investment: 0,
    installment: 0,
  };
  for (const m of movements) {
    counts[m.kind] += 1;
  }

  return {
    income: irrMoney(incomeMinor),
    expense: irrMoney(expenseMinor),
    net: irrMoney(netMinor),
    allocated: irrMoney(allocatedMinor),
    allocation: {
      goals: irrMoney(goals),
      settlements: irrMoney(openSettle),
      liquid: irrMoney(liquid),
      investments: irrMoney(investments),
      installments: irrMoney(installments),
    },
    savingsRatePercent,
    goals: goalSnaps,
    intents,
    counts,
    movements,
    scope: linked || input.spaceKind === "personal" ? "personal_linked" : "workspace",
    notes,
  };
}

/**
 * Build a dual-series chart from pulse movements (income vs expense by YYYY-MM).
 * Only uses real movement rows — empty points omitted.
 */
export function moneyPulseFlowSeries(
  movements: readonly WorkspaceMoneyMovement[],
): ChartSeriesResponse {
  const income = new Map<string, bigint>();
  const expense = new Map<string, bigint>();
  for (const m of movements) {
    const ym = m.occurredOn.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const amt = BigInt(m.amount.amountMinor);
    if (m.kind === "income" || (m.kind === "transfer" && m.direction === "in")) {
      income.set(ym, (income.get(ym) ?? 0n) + amt);
    } else if (m.kind === "expense") {
      expense.set(ym, (expense.get(ym) ?? 0n) + amt);
    }
  }
  const keys = [...new Set([...income.keys(), ...expense.keys()])].sort();
  return {
    chart: "income-vs-expense" as const,
    currency: "IRR" as const,
    points: keys.map((key) => ({
      key,
      label: key,
      valueMinor: (income.get(key) ?? 0n).toString(),
      secondaryMinor: (expense.get(key) ?? 0n).toString(),
    })),
    source: "money_pulse_movements",
  };
}


/**
 * Donut/stack series: where money went this range — only non-zero real buckets.
 */
export function moneyPulseWhereWentSeries(pulse: WorkspaceMoneyPulse): ChartSeriesResponse {
  const buckets: Array<{ key: string; label: string; valueMinor: string }> = [];
  const push = (key: string, label: string, minor: string) => {
    if (BigInt(minor) > 0n) buckets.push({ key, label, valueMinor: minor });
  };
  push("expense", "خرج", pulse.expense.amountMinor);
  push("installments", "اقساط", pulse.allocation.installments.amountMinor);
  push("investments", "سرمایه‌گذاری", pulse.allocation.investments.amountMinor);
  push("goals", "پس‌انداز/هدف", pulse.allocation.goals.amountMinor);
  push("settlements", "تسویه/بدهی", pulse.allocation.settlements.amountMinor);
  return {
    chart: "category-mix",
    currency: "IRR",
    points: buckets.map((b) => ({
      key: b.key,
      label: b.label,
      valueMinor: b.valueMinor,
    })),
    source: "money_pulse_allocation",
    emptyReason: buckets.length === 0 ? "در این بازه خروجی ثبت نشده" : undefined,
  };
}
