import type {
  UpsertWorkspaceDayRequest,
  WorkspaceDaySummary,
} from "@dang/contracts";

export const WORKSPACE_DAY_STORE = Symbol("WORKSPACE_DAY_STORE");

export type WorkspaceDayUpsertInput = UpsertWorkspaceDayRequest & {
  /** Server-owned: ids reversed when marking holiday. */
  holidayReversedExpenseIds?: string[];
};

export type WorkspaceDayStore = {
  readonly persistence: "memory" | "postgres";
  listDays(
    workspaceId: string,
    actorUserId: string,
    from: string,
    to: string,
  ): Promise<WorkspaceDaySummary[]>;
  upsertDay(
    workspaceId: string,
    actorUserId: string,
    date: string,
    input: WorkspaceDayUpsertInput,
  ): Promise<WorkspaceDaySummary>;
};

export class MemoryWorkspaceDayStore implements WorkspaceDayStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, WorkspaceDaySummary>();

  private key(workspaceId: string, date: string): string {
    return `${workspaceId}:${date}`;
  }

  listDays(
    workspaceId: string,
    _actorUserId: string,
    from: string,
    to: string,
  ): Promise<WorkspaceDaySummary[]> {
    const out: WorkspaceDaySummary[] = [];
    for (const row of this.rows.values()) {
      if (row.workspaceId !== workspaceId) continue;
      if (row.date < from || row.date > to) continue;
      out.push(row);
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return Promise.resolve(out);
  }

  upsertDay(
    workspaceId: string,
    actorUserId: string,
    date: string,
    input: WorkspaceDayUpsertInput,
  ): Promise<WorkspaceDaySummary> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Promise.reject(new Error("DATE"));
    }
    const key = this.key(workspaceId, date);
    const prev = this.rows.get(key);
    const next: WorkspaceDaySummary = {
      workspaceId,
      date,
      isHoliday: input.isHoliday ?? prev?.isHoliday ?? false,
      note:
        input.note === null
          ? undefined
          : input.note !== undefined
            ? input.note.trim() || undefined
            : prev?.note,
      holidayReversedExpenseIds:
        input.holidayReversedExpenseIds !== undefined
          ? [...input.holidayReversedExpenseIds]
          : prev?.holidayReversedExpenseIds
            ? [...prev.holidayReversedExpenseIds]
            : [],
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(key, next);
    void actorUserId;
    return Promise.resolve(next);
  }
}
