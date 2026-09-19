import {
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  AnalyticsEtlRunSummary,
  AnalyticsWarehouseSnapshot,
  AuthActor,
} from "@dang/contracts";
import {
  buildDailySpendFacts,
  canViewProductMetrics,
  resolveAnalyticsWarehouseMode,
} from "@dang/contracts";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { resolveExpenseListOptions } from "../expenses/expense-list-options.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { WaveFSettingsService } from "../wave-f-settings/wave-f-settings.service.js";
import { ANALYTICS_STORE, type AnalyticsStore } from "./analytics.store.js";

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_STORE) private readonly analytics: AnalyticsStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(WaveFSettingsService) private readonly plans: WaveFSettingsService,
  ) {}

  mode(): ReturnType<typeof resolveAnalyticsWarehouseMode> {
    return resolveAnalyticsWarehouseMode({
      persistence: this.analytics.persistence,
      analyticsDatabaseUrl: this.analytics.analyticsDatabaseUrlConfigured
        ? "configured"
        : null,
    });
  }

  async snapshot(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<AnalyticsWarehouseSnapshot> {
    await this.requireMetricsReader(workspaceId, actor.userId);
    await this.plans.requirePlanFeature(actor, workspaceId, "analytics");
    const [facts, lastRun] = await Promise.all([
      this.analytics.listFacts(workspaceId, actor.userId),
      this.analytics.lastRun(workspaceId, actor.userId),
    ]);
    const mode = this.mode();
    return {
      workspaceId,
      persistence: this.analytics.persistence,
      mode,
      facts,
      lastRun,
      note:
        mode === "postgres_replica_etl"
          ? "انبار روی ANALYTICS_DATABASE_URL — فقط‌خواندنی از دید محصول؛ ETL از OLTP می‌نویسد."
          : mode === "postgres_etl"
            ? "انبار schema=analytics روی همان Postgres (جدا از OLTP منطقی) — نه replica فیزیکی."
            : "انبار حافظه‌ای — با ریستارت API پاک می‌شود؛ برای dev/test.",
    };
  }

  async runEtl(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<AnalyticsEtlRunSummary> {
    await this.requireMetricsReader(workspaceId, actor.userId);
    await this.plans.requirePlanFeature(actor, workspaceId, "analytics");
    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    try {
      const { viewAllPrivate } = await resolveExpenseListOptions(
        this.iam,
        workspaceId,
        actor.userId,
      );
      const list = await this.expenses.listForWorkspace(workspaceId, actor.userId, {
        viewAllPrivate,
      });
      const refreshedAt = new Date().toISOString();
      const facts = buildDailySpendFacts(
        workspaceId,
        list.map((e) => ({
          occurredOn: e.occurredOn,
          status: e.status,
          visibility: e.visibility,
          total: e.total,
        })),
        refreshedAt,
      );
      await this.analytics.replaceFacts(workspaceId, actor.userId, facts);
      const run: AnalyticsEtlRunSummary = {
        id: runId,
        workspaceId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "success",
        rowsUpserted: facts.length,
        source: "oltp_expenses_posted",
      };
      await this.analytics.recordRun(workspaceId, actor.userId, run);
      return run;
    } catch (error: unknown) {
      const run: AnalyticsEtlRunSummary = {
        id: runId,
        workspaceId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failure",
        rowsUpserted: 0,
        source: "oltp_expenses_posted",
        error: error instanceof Error ? error.message : "ETL_FAILED",
      };
      await this.analytics.recordRun(workspaceId, actor.userId, run).catch(() => undefined);
      throw error;
    }
  }

  private async requireMetricsReader(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, userId);
    if (!members) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    const role = members.find((m) => m.userId === userId)?.role;
    if (!canViewProductMetrics(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Analytics warehouse restricted",
        status: 403,
        detail: "Only owner, admin, finance, or auditor may read/run analytics ETL.",
      });
    }
  }
}
