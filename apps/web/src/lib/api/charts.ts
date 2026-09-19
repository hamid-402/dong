import type {
  ChartSeriesResponse,
  KindChartsAggregateResponse,
  SpaceKind,
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

/** S11-11 chart series endpoints (+ G07 kind aggregate). */
export const chartsApi = {
  workspaceChartExpenseTrend: (workspaceId: string, months?: number) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/expense-trend${qs({ months })}`,
    ),
  workspaceChartMemberShare: (workspaceId: string, from?: string, to?: string) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/member-share${qs({ from, to })}`,
    ),
  workspaceChartCategoryMix: (workspaceId: string, from?: string, to?: string) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/category-mix${qs({ from, to })}`,
    ),
  workspaceChartBalanceOverTime: (workspaceId: string, from?: string, to?: string) =>
    apiFetch<ChartSeriesResponse>(
      `/workspaces/${workspaceId}/charts/balance-over-time${qs({ from, to })}`,
    ),
  personalChartIncomeVsExpense: (months?: number) =>
    apiFetch<ChartSeriesResponse>(`/personal/charts/income-vs-expense${qs({ months })}`),
  personalChartBudgetBurn: (yearMonth?: string) =>
    apiFetch<ChartSeriesResponse>(`/personal/charts/budget-burn${qs({ yearMonth })}`),
  personalChartGoalProgress: () =>
    apiFetch<ChartSeriesResponse>(`/personal/charts/goal-progress`),
  /** Server-side cross-workspace aggregate with membership + plan ACL (G07 #40). */
  kindChartsAggregate: (kind: SpaceKind, months?: number) =>
    apiFetch<KindChartsAggregateResponse>(
      `/me/charts/kind/${kind}${qs({ months })}`,
    ),
};
