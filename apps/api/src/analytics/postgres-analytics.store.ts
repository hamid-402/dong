import { and, desc, eq } from "@dang/db";
import {
  createDatabase,
  dailySpendFact,
  etlRun,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  AnalyticsDailySpendFact,
  AnalyticsEtlRunSummary,
} from "@dang/contracts";
import type { AnalyticsStore } from "./analytics.store.js";

function toFact(row: typeof dailySpendFact.$inferSelect): AnalyticsDailySpendFact {
  const day =
    typeof row.day === "string"
      ? row.day.slice(0, 10)
      : new Date(row.day).toISOString().slice(0, 10);
  return {
    workspaceId: row.workspaceId,
    day,
    expenseCount: row.expenseCount,
    totalMinor: row.totalMinor,
    currency: "IRR",
    refreshedAt: row.refreshedAt.toISOString(),
  };
}

function toRun(row: typeof etlRun.$inferSelect): AnalyticsEtlRunSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    status: row.status === "failure" ? "failure" : "success",
    rowsUpserted: row.rowsUpserted,
    source: "oltp_expenses_posted",
    error: row.error ?? undefined,
  };
}

export class PostgresAnalyticsStore implements AnalyticsStore {
  readonly persistence = "postgres" as const;

  constructor(
    readonly db: AppDatabase,
    readonly analyticsDatabaseUrlConfigured: boolean,
  ) {}

  static fromConnectionString(
    url: string,
    analyticsDatabaseUrlConfigured: boolean,
  ): PostgresAnalyticsStore {
    const { db } = createDatabase(url);
    return new PostgresAnalyticsStore(db, analyticsDatabaseUrlConfigured);
  }

  async replaceFacts(
    workspaceId: string,
    actorUserId: string,
    facts: readonly AnalyticsDailySpendFact[],
  ): Promise<void> {
    await withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      await tx
        .delete(dailySpendFact)
        .where(eq(dailySpendFact.workspaceId, workspaceId));
      if (facts.length === 0) return;
      await tx.insert(dailySpendFact).values(
        facts.map((f) => ({
          workspaceId: f.workspaceId,
          day: f.day,
          expenseCount: f.expenseCount,
          totalMinor: f.totalMinor,
          currency: f.currency,
          refreshedAt: new Date(f.refreshedAt),
        })),
      );
    });
  }

  async listFacts(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AnalyticsDailySpendFact[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(dailySpendFact)
        .where(eq(dailySpendFact.workspaceId, workspaceId))
        .orderBy(desc(dailySpendFact.day));
      return rows.map(toFact).sort((a, b) => a.day.localeCompare(b.day));
    });
  }

  async recordRun(
    workspaceId: string,
    actorUserId: string,
    run: AnalyticsEtlRunSummary,
  ): Promise<void> {
    await withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      await tx.insert(etlRun).values({
        id: run.id,
        workspaceId: run.workspaceId,
        startedAt: new Date(run.startedAt),
        finishedAt: new Date(run.finishedAt),
        status: run.status,
        rowsUpserted: run.rowsUpserted,
        source: run.source,
        error: run.error,
      });
    });
  }

  async lastRun(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AnalyticsEtlRunSummary | null> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(etlRun)
        .where(and(eq(etlRun.workspaceId, workspaceId)))
        .orderBy(desc(etlRun.finishedAt))
        .limit(1);
      const row = rows[0];
      return row ? toRun(row) : null;
    });
  }
}
