import type { Money } from "./money.js";
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
  kind: "income" | "expense" | "settlement" | "contribution" | "transfer";
  title: string;
  amount: Money;
  /** Sign for display: inflow positive, outflow negative convention in UI. */
  direction: "in" | "out";
  occurredOn: string;
  /** Client route hint — never a fake deep link. */
  hrefHint: "expenses" | "settlements" | "me-finance" | "ledger" | "charts";
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

/**
 * Build home money pulse from store-backed slices (pure).
 * Does not invent income for group/org workspaces without personal txns.
 */
export function buildWorkspaceMoneyPulse(input: {
  spaceKind: "personal" | "group" | "org";
  postedSpend: Money;
  openSettlementTotal: Money;
  personalIncomeMinor?: bigint;
  personalExpenseMinor?: bigint;
  /** Cumulative savings-goal contributions (all-time progress). */
  goalsContributedMinor?: bigint;
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
  let allocatedMinor = goals;
  if (goals > 0n) notes.push("تخصیص‌شده شامل جمع مشارکت اهداف پس‌انداز است");
  if (openSettle > 0n) {
    allocatedMinor += openSettle;
    notes.push("تخصیص‌شده شامل مبلغ تسویه‌های باز است");
  }
  if (allocatedMinor === 0n) {
    notes.push("هنوز تخصیص پس‌انداز/سرمایه یا تسویه باز ثبت نشده");
  }

  const netMinor = incomeMinor - expenseMinor;
  const movements = [...input.movements]
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    .slice(0, 40);

  return {
    income: irrMoney(incomeMinor),
    expense: irrMoney(expenseMinor),
    net: irrMoney(netMinor),
    allocated: irrMoney(allocatedMinor),
    movements,
    scope: linked || input.spaceKind === "personal" ? "personal_linked" : "workspace",
    notes,
  };
}
