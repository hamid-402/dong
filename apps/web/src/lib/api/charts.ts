import {
  planAllows,
  type ChartSeriesResponse,
  type KindChartsAggregateResponse,
  type SpaceKind,
  type WorkspacePlanSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

const planCache = new Map<string, { ok: boolean; at: number }>();
const PLAN_TTL_MS = 30_000;

/**
 * Analytics warehouse check — product policy unlocks all plans via `planAllows`.
 * Kept so UI can still react if an API plan row is missing or the call fails.
 */
export async function workspaceAllowsAnalytics(
  workspaceId: string,
): Promise<boolean> {
  const hit = planCache.get(workspaceId);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return hit.ok;

  const plan = await apiFetch<WorkspacePlanSummary>(
    `/workspaces/${workspaceId}/plan`,
  );
  const ok = planAllows(plan.plan, "analytics");
  planCache.set(workspaceId, { ok, at: Date.now() });
  return ok;
}

/** Clear cached plan after an upgrade so warehouse UI retries against the live plan. */
export function invalidateWorkspaceAnalyticsCache(workspaceId?: string): void {
  if (workspaceId) planCache.delete(workspaceId);
  else planCache.clear();
}

/** S11-11 chart series endpoints (+ G07 kind aggregate). */
export const chartsApi = {
  workspaceChartExpenseTrend: (workspaceId: string, months?: number) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/expense-trend${qs({ months })}`,
    ),

  workspaceChartMemberShare: (
    workspaceId: string,
    from?: string,
    to?: string,
  ) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/member-share${qs({ from, to })}`,
    ),

  workspaceChartCategoryMix: (
    workspaceId: string,
    from?: string,
    to?: string,
  ) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/category-mix${qs({ from, to })}`,
    ),

  workspaceChartBalanceOverTime: (
    workspaceId: string,
    from?: string,
    to?: string,
  ) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/balance-over-time${qs({ from, to })}`,
    ),

  personalChartIncomeVsExpense: (months?: number) =>
    apiFetch<ChartSeriesResponse>(
      `/personal/charts/income-vs-expense${qs({ months })}`,
    ),

  personalChartBudgetBurn: (yearMonth?: string) =>
    apiFetch<ChartSeriesResponse>(
      `/personal/charts/budget-burn${qs({ yearMonth })}`,
    ),

  personalChartGoalProgress: () =>
    apiFetch<ChartSeriesResponse>(`/personal/charts/goal-progress`),

  /** Server-side cross-workspace aggregate with membership ACL (G07 #40). */
  kindChartsAggregate: (kind: SpaceKind, months?: number) =>
    apiFetch<KindChartsAggregateResponse>(
      `/me/charts/kind/${kind}${qs({ months })}`,
    ),
};
