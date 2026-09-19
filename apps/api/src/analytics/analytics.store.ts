import type {
  AnalyticsDailySpendFact,
  AnalyticsEtlRunSummary,
} from "@dang/contracts";

export type AnalyticsStore = {
  readonly persistence: "memory" | "postgres";
  /** Optional separate connection string used for warehouse (replica). */
  readonly analyticsDatabaseUrlConfigured: boolean;
  replaceFacts(
    workspaceId: string,
    actorUserId: string,
    facts: readonly AnalyticsDailySpendFact[],
  ): Promise<void>;
  listFacts(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AnalyticsDailySpendFact[]>;
  recordRun(
    workspaceId: string,
    actorUserId: string,
    run: AnalyticsEtlRunSummary,
  ): Promise<void>;
  lastRun(
    workspaceId: string,
    actorUserId: string,
  ): Promise<AnalyticsEtlRunSummary | null>;
};

export const ANALYTICS_STORE = Symbol("ANALYTICS_STORE");

export class MemoryAnalyticsStore implements AnalyticsStore {
  readonly persistence = "memory" as const;
  readonly analyticsDatabaseUrlConfigured = false;
  private readonly facts = new Map<string, AnalyticsDailySpendFact[]>();
  private readonly runs = new Map<string, AnalyticsEtlRunSummary[]>();

  replaceFacts(
    workspaceId: string,
    _actorUserId: string,
    facts: readonly AnalyticsDailySpendFact[],
  ): Promise<void> {
    this.facts.set(
      workspaceId,
      [...facts].sort((a, b) => a.day.localeCompare(b.day)),
    );
    return Promise.resolve();
  }

  listFacts(workspaceId: string, _actorUserId: string): Promise<AnalyticsDailySpendFact[]> {
    return Promise.resolve([...(this.facts.get(workspaceId) ?? [])]);
  }

  recordRun(
    workspaceId: string,
    _actorUserId: string,
    run: AnalyticsEtlRunSummary,
  ): Promise<void> {
    const list = this.runs.get(workspaceId) ?? [];
    list.unshift(run);
    this.runs.set(workspaceId, list.slice(0, 50));
    return Promise.resolve();
  }

  lastRun(
    workspaceId: string,
    _actorUserId: string,
  ): Promise<AnalyticsEtlRunSummary | null> {
    return Promise.resolve(this.runs.get(workspaceId)?.[0] ?? null);
  }
}
