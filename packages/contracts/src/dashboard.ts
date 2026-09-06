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
  source: {
    expense: "memory" | "postgres";
    ledger: "memory" | "postgres";
    settlement: "memory" | "postgres";
    notification: "memory" | "postgres";
  };
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
