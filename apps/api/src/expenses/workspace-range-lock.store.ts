import type {
  CreateWorkspaceRangeLockRequest,
  WorkspaceRangeLockSummary,
} from "@dang/contracts";

export const WORKSPACE_RANGE_LOCK_STORE = Symbol("WORKSPACE_RANGE_LOCK_STORE");

export type WorkspaceRangeLockStore = {
  readonly persistence: "memory" | "postgres";
  list(
    workspaceId: string,
    actorUserId: string,
    opts?: { activeOnly?: boolean },
  ): Promise<WorkspaceRangeLockSummary[]>;
  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateWorkspaceRangeLockRequest,
  ): Promise<WorkspaceRangeLockSummary>;
  unlock(
    workspaceId: string,
    lockId: string,
    actorUserId: string,
  ): Promise<WorkspaceRangeLockSummary>;
};

type MemoryLock = WorkspaceRangeLockSummary & { idempotencyKey: string };

function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

function toSummary(row: MemoryLock): WorkspaceRangeLockSummary {
  const { idempotencyKey: _k, ...rest } = row;
  return rest;
}

export class MemoryWorkspaceRangeLockStore implements WorkspaceRangeLockStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, MemoryLock>();

  list(
    workspaceId: string,
    _actorUserId: string,
    opts?: { activeOnly?: boolean },
  ): Promise<WorkspaceRangeLockSummary[]> {
    const out = [...this.rows.values()]
      .filter((r) => {
        if (r.workspaceId !== workspaceId) return false;
        if (opts?.activeOnly && !r.active) return false;
        return true;
      })
      .map(toSummary);
    out.sort((a, b) => (a.from < b.from ? -1 : 1));
    return Promise.resolve(out);
  }

  create(
    workspaceId: string,
    actorUserId: string,
    input: CreateWorkspaceRangeLockRequest,
  ): Promise<WorkspaceRangeLockSummary> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
      return Promise.reject(new Error("DATE_RANGE"));
    }
    if (input.from > input.to) return Promise.reject(new Error("DATE_RANGE"));
    if (!input.idempotencyKey?.trim()) return Promise.reject(new Error("IDEMPOTENCY"));
    const idem = input.idempotencyKey.trim();

    for (const row of this.rows.values()) {
      if (row.workspaceId === workspaceId && row.idempotencyKey === idem) {
        return Promise.resolve(toSummary(row));
      }
    }

    for (const row of this.rows.values()) {
      if (row.workspaceId !== workspaceId || !row.active) continue;
      if (overlaps(row.from, row.to, input.from, input.to)) {
        return Promise.reject(new Error("RANGE_OVERLAP"));
      }
    }

    const summary: MemoryLock = {
      id: crypto.randomUUID(),
      workspaceId,
      from: input.from,
      to: input.to,
      reason: input.reason?.trim() || undefined,
      lockedByUserId: actorUserId,
      lockedAt: new Date().toISOString(),
      active: true,
      idempotencyKey: idem,
    };
    this.rows.set(summary.id, summary);
    return Promise.resolve(toSummary(summary));
  }

  unlock(
    workspaceId: string,
    lockId: string,
    actorUserId: string,
  ): Promise<WorkspaceRangeLockSummary> {
    const existing = this.rows.get(lockId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("NOT_FOUND"));
    }
    if (!existing.active) return Promise.resolve(toSummary(existing));
    const updated: MemoryLock = {
      ...existing,
      active: false,
      unlockedByUserId: actorUserId,
      unlockedAt: new Date().toISOString(),
    };
    this.rows.set(lockId, updated);
    return Promise.resolve(toSummary(updated));
  }
}
