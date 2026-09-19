/**
 * Analytics warehouse contracts (R10-20).
 * Facts are ETL projections — not live OLTP queries disguised as a warehouse.
 */

export type AnalyticsWarehouseMode =
  | "memory_etl"
  | "postgres_etl"
  | "postgres_replica_etl";

export type AnalyticsDailySpendFact = {
  workspaceId: string;
  /** ISO calendar day YYYY-MM-DD */
  day: string;
  expenseCount: number;
  /** Sum of posted expense totals (IRR minor). */
  totalMinor: string;
  currency: "IRR";
  refreshedAt: string;
};

export type AnalyticsEtlRunSummary = {
  id: string;
  workspaceId: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failure";
  rowsUpserted: number;
  source: "oltp_expenses_posted";
  error?: string;
};

export type AnalyticsWarehouseSnapshot = {
  workspaceId: string;
  persistence: "memory" | "postgres";
  mode: AnalyticsWarehouseMode;
  facts: AnalyticsDailySpendFact[];
  lastRun: AnalyticsEtlRunSummary | null;
  /** Honest operator note — never claims live OLTP. */
  note: string;
};

export type AnalyticsExpenseSourceRow = {
  occurredOn: string;
  status: string;
  visibility?: string;
  total: { amountMinor: string; currency: string };
};

/**
 * Build daily spend facts from posted expenses only.
 * Private expenses are excluded (same honesty as member-facing reports).
 */
export function buildDailySpendFacts(
  workspaceId: string,
  expenses: readonly AnalyticsExpenseSourceRow[],
  refreshedAt: string = new Date().toISOString(),
): AnalyticsDailySpendFact[] {
  const buckets = new Map<string, { count: number; total: bigint }>();
  for (const row of expenses) {
    if (row.status !== "posted") continue;
    if (row.visibility === "private") continue;
    if (row.total.currency !== "IRR") continue;
    const day = row.occurredOn.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    let amount: bigint;
    try {
      amount = BigInt(row.total.amountMinor);
    } catch {
      continue;
    }
    if (amount < 0n) continue;
    const prev = buckets.get(day) ?? { count: 0, total: 0n };
    buckets.set(day, {
      count: prev.count + 1,
      total: prev.total + amount,
    });
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, agg]) => ({
      workspaceId,
      day,
      expenseCount: agg.count,
      totalMinor: agg.total.toString(),
      currency: "IRR" as const,
      refreshedAt,
    }));
}

export function resolveAnalyticsWarehouseMode(input: {
  persistence: "memory" | "postgres";
  analyticsDatabaseUrl?: string | null;
}): AnalyticsWarehouseMode {
  if (input.persistence === "memory") return "memory_etl";
  if (input.analyticsDatabaseUrl?.trim()) return "postgres_replica_etl";
  return "postgres_etl";
}
