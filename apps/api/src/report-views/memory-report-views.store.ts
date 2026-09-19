import type { CreateReportViewRequest, ReportViewSummary } from "@dang/contracts";
import type { ReportViewsStore } from "./report-views.types.js";

export class MemoryReportViewsStore implements ReportViewsStore {
  readonly persistence = "memory" as const;
  private readonly byUser = new Map<string, ReportViewSummary[]>();

  list(userId: string): Promise<ReportViewSummary[]> {
    return Promise.resolve([...(this.byUser.get(userId) ?? [])]);
  }

  create(userId: string, input: CreateReportViewRequest): Promise<ReportViewSummary> {
    const now = new Date().toISOString();
    const row: ReportViewSummary = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      months: input.months,
      sortKey: input.sortKey,
      createdAt: now,
      updatedAt: now,
    };
    const list = this.byUser.get(userId) ?? [];
    list.push(row);
    this.byUser.set(userId, list);
    return Promise.resolve(row);
  }

  delete(userId: string, viewId: string): Promise<boolean> {
    const list = this.byUser.get(userId) ?? [];
    const next = list.filter((row) => row.id !== viewId);
    if (next.length === list.length) return Promise.resolve(false);
    this.byUser.set(userId, next);
    return Promise.resolve(true);
  }
}
