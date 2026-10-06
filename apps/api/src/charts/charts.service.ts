import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  AuthActor,
  ChartSeriesResponse,
  KindChartsAggregateResponse,
  SpaceKind,
} from "@dang/contracts";
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
  spaceKindForTemplate,
} from "@dang/contracts";
import {
  ANALYTICS_STORE,
  type AnalyticsStore,
} from "../analytics/analytics.store.js";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { resolveExpenseListOptions } from "../expenses/expense-list-options.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  PERSONAL_GOALS_STORE,
  type PersonalGoalsStore,
} from "../personal-finance/personal-goals.types.js";
import {
  PERSONAL_RESOURCES_STORE,
  type PersonalResourcesStore,
} from "../personal-finance/personal-resources.types.js";
import { REPORTS_STORE, type ReportsStore } from "../reports/reports.store.js";
import { WaveFSettingsService } from "../wave-f-settings/wave-f-settings.service.js";

function assertRange(from: string, to: string): void {
  if (from > to) {
    throw new BadRequestException({
      type: "https://dang.local/problems/validation",
      title: "Invalid date range",
      status: 400,
      detail: "from باید قبل از to باشد",
      code: "CHART_RANGE",
    });
  }
}

function currentYearMonth(asOf = new Date()): string {
  return `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class ChartsService {
  constructor(
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(ANALYTICS_STORE) private readonly analytics: AnalyticsStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(PERSONAL_RESOURCES_STORE) private readonly resources: PersonalResourcesStore,
    @Inject(PERSONAL_GOALS_STORE) private readonly goals: PersonalGoalsStore,
    @Inject(REPORTS_STORE) private readonly reports: ReportsStore,
    @Inject(WaveFSettingsService) private readonly plans: WaveFSettingsService,
  ) {}

  async expenseTrend(
    actor: AuthActor,
    workspaceId: string,
    months?: number,
  ): Promise<ChartSeriesResponse> {
    await this.requireWorkspaceCharts(actor, workspaceId);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    const [facts, list] = await Promise.all([
      this.analytics.listFacts(workspaceId, actor.userId),
      this.expenses.listForWorkspace(workspaceId, actor.userId, { viewAllPrivate }),
    ]);
    return aggregateExpenseTrend({
      months,
      facts: facts.length > 0 ? facts : undefined,
      expenses: list,
    });
  }

  async memberShare(
    actor: AuthActor,
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<ChartSeriesResponse> {
    await this.requireWorkspaceCharts(actor, workspaceId);
    const range = this.resolveRange(from, to);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    const [list, members] = await Promise.all([
      this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      }),
      this.iam.listMembers(workspaceId, actor.userId),
    ]);
    const memberLabels = new Map<string, string>();
    for (const m of members ?? []) {
      const name = m.displayName?.trim();
      if (name) memberLabels.set(m.userId, name);
    }
    return aggregateMemberShare({
      ...range,
      expenses: list,
      memberLabels: memberLabels.size > 0 ? memberLabels : undefined,
    });
  }

  async categoryMix(
    actor: AuthActor,
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<ChartSeriesResponse> {
    await this.requireWorkspaceCharts(actor, workspaceId);
    const range = this.resolveRange(from, to);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    const [list, categories] = await Promise.all([
      this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      }),
      this.reports.listCategories(workspaceId, actor.userId),
    ]);
    const categoryLabels = new Map(
      categories.map((c) => [c.id, c.name] as const),
    );
    return aggregateCategoryMix({
      ...range,
      expenses: list,
      categoryLabels: categoryLabels.size > 0 ? categoryLabels : undefined,
    });
  }

  async balanceOverTime(
    actor: AuthActor,
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<ChartSeriesResponse> {
    await this.requireWorkspaceCharts(actor, workspaceId);
    const range = this.resolveRange(from, to);
    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actor.userId,
    );
    const list = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
      viewAllPrivate,
    });
    return aggregateBalanceOverTime({ ...range, expenses: list });
  }

  async incomeVsExpense(
    actor: AuthActor,
    months?: number,
  ): Promise<ChartSeriesResponse> {
    const asOf = new Date();
    const monthKeysNeeded = months ?? 6;
    const closes: Awaited<ReturnType<PersonalGoalsStore["getMonthlyClose"]>>[] = [];
    const ymNow = currentYearMonth(asOf);
    const [y, m] = ymNow.split("-").map(Number) as [number, number];
    for (let i = 0; i < monthKeysNeeded; i += 1) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const close = await this.goals.getMonthlyClose(actor.userId, ym);
      if (close) closes.push(close);
    }
    if (closes.length > 0) {
      return aggregateIncomeVsExpense({
        months,
        asOf,
        closes: closes.filter((c): c is NonNullable<typeof c> => c != null),
      });
    }
    const fromYm = (() => {
      const d = new Date(Date.UTC(y, m - monthKeysNeeded, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    })();
    const to = asOf.toISOString().slice(0, 10);
    const txns = await this.resources.listTxns(actor.userId, {
      from: fromYm,
      to,
      limit: 50_000,
    });
    return aggregateIncomeVsExpense({ months, asOf, txns });
  }

  async budgetBurn(
    actor: AuthActor,
    yearMonth?: string,
  ): Promise<ChartSeriesResponse> {
    const ym = yearMonth ?? currentYearMonth();
    const budgets = await this.resources.listBudgets(actor.userId);
    const budget = budgets.find((b) => b.yearMonth === ym) ?? null;
    const from = `${ym}-01`;
    const [y, m] = ym.split("-").map(Number) as [number, number];
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${ym}-${String(lastDay).padStart(2, "0")}`;
    const txns = await this.resources.listTxns(actor.userId, {
      from,
      to,
      limit: 50_000,
    });
    return aggregateBudgetBurn({ yearMonth: ym, budget, txns });
  }

  async goalProgress(actor: AuthActor): Promise<ChartSeriesResponse> {
    const goals = await this.goals.listSavingsGoals(actor.userId);
    return aggregateGoalProgress({ goals });
  }

  async kindAggregate(
    actor: AuthActor,
    kind: SpaceKind,
    months?: number,
  ): Promise<KindChartsAggregateResponse> {
    const resolvedMonths = months ?? 6;
    const range = chartRangeForMonths(resolvedMonths);
    const workspaces = (await this.iam.listWorkspacesForUser(actor.userId)).filter(
      (ws) => spaceKindForTemplate(ws.template) === kind,
    );

    const trendParts: Array<{ label: string; series: ChartSeriesResponse }> = [];
    const mixParts: Array<{ label: string; series: ChartSeriesResponse }> = [];
    const spaces: KindChartsAggregateResponse["spaces"] = [];

    for (const workspace of workspaces) {
      try {
        await this.access.requireMember(workspace.id, actor.userId);
        await this.plans.requirePlanFeature(actor, workspace.id, "reports");
      } catch (err) {
        if (err instanceof ForbiddenException) continue;
        throw err;
      }

      const { viewAllPrivate } = await resolveExpenseListOptions(
        this.iam,
        workspace.id,
        actor.userId,
      );
      const [facts, list, categories] = await Promise.all([
        this.analytics.listFacts(workspace.id, actor.userId),
        this.expenses.listForWorkspace(workspace.id, actor.userId, { viewAllPrivate }),
        this.reports.listCategories(workspace.id, actor.userId),
      ]);
      const expenseTrend = aggregateExpenseTrend({
        months: resolvedMonths,
        facts: facts.length > 0 ? facts : undefined,
        expenses: list,
      });
      const categoryLabels = new Map(
        categories.map((c) => [c.id, c.name] as const),
      );
      const categoryMix = aggregateCategoryMix({
        ...range,
        expenses: list,
        categoryLabels: categoryLabels.size > 0 ? categoryLabels : undefined,
      });

      trendParts.push({ label: workspace.slug, series: expenseTrend });
      mixParts.push({ label: workspace.slug, series: categoryMix });
      spaces.push({
        workspaceId: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        expenseTrend,
      });
    }

    return {
      kind,
      months: resolvedMonths,
      expenseTrend: mergeSumChartSeries(trendParts, "expense-trend"),
      categoryMix: mergeSumChartSeries(mixParts, "category-mix"),
      spaces,
    };
  }

  /** Workspace charts from live expenses use free `reports`; warehouse ETL stays on `analytics`. */
  private async requireWorkspaceCharts(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<void> {
    await this.access.requireMember(workspaceId, actor.userId);
    await this.plans.requirePlanFeature(actor, workspaceId, "reports");
  }

  private resolveRange(from?: string, to?: string): { from: string; to: string } {
    if (from && to) {
      assertRange(from, to);
      return { from, to };
    }
    if (from || to) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid date range",
        status: 400,
        detail: "from و to باید با هم ارسال شوند",
        code: "CHART_RANGE",
      });
    }
    return defaultChartDateRange(90);
  }
}

function chartRangeForMonths(months: number): { from: string; to: string } {
  const keys = chartMonthKeys(months);
  const from = `${keys[0]}-01`;
  const lastYm = keys[keys.length - 1]!;
  const [y, m] = lastYm.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${lastYm}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}
