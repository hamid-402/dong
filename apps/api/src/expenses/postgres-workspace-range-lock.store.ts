import {
  and,
  createDatabase,
  eq,
  isNull,
  workspaceRangeLock,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateWorkspaceRangeLockRequest,
  WorkspaceRangeLockSummary,
} from "@dang/contracts";
import type { WorkspaceRangeLockStore } from "./workspace-range-lock.store.js";

function formatDate(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapRow(row: typeof workspaceRangeLock.$inferSelect): WorkspaceRangeLockSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    from: formatDate(row.rangeStart),
    to: formatDate(row.rangeEnd),
    reason: row.reason ?? undefined,
    lockedByUserId: row.lockedByUserId,
    lockedAt: row.lockedAt.toISOString(),
    unlockedByUserId: row.unlockedByUserId ?? undefined,
    unlockedAt: row.unlockedAt?.toISOString(),
    active: row.unlockedAt == null,
  };
}

function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

export class PostgresWorkspaceRangeLockStore implements WorkspaceRangeLockStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresWorkspaceRangeLockStore {
    const { db } = createDatabase(connectionString);
    return new PostgresWorkspaceRangeLockStore(db);
  }

  list(
    workspaceId: string,
    actorUserId: string,
    opts?: { activeOnly?: boolean },
  ): Promise<WorkspaceRangeLockSummary[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = opts?.activeOnly
        ? await tx
            .select()
            .from(workspaceRangeLock)
            .where(
              and(
                eq(workspaceRangeLock.workspaceId, workspaceId),
                isNull(workspaceRangeLock.unlockedAt),
              ),
            )
        : await tx
            .select()
            .from(workspaceRangeLock)
            .where(eq(workspaceRangeLock.workspaceId, workspaceId));
      return rows.map(mapRow).sort((a, b) => (a.from < b.from ? -1 : 1));
    });
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

    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(workspaceRangeLock)
        .where(
          and(
            eq(workspaceRangeLock.workspaceId, workspaceId),
            eq(workspaceRangeLock.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) return mapRow(existing[0]);

      const active = await tx
        .select()
        .from(workspaceRangeLock)
        .where(
          and(
            eq(workspaceRangeLock.workspaceId, workspaceId),
            isNull(workspaceRangeLock.unlockedAt),
          ),
        );
      for (const row of active) {
        const from = formatDate(row.rangeStart);
        const to = formatDate(row.rangeEnd);
        if (overlaps(from, to, input.from, input.to)) {
          throw new Error("RANGE_OVERLAP");
        }
      }

      const inserted = await tx
        .insert(workspaceRangeLock)
        .values({
          workspaceId,
          rangeStart: input.from,
          rangeEnd: input.to,
          reason: input.reason?.trim() || null,
          idempotencyKey: input.idempotencyKey.trim(),
          lockedByUserId: actorUserId,
        })
        .returning();
      return mapRow(inserted[0]!);
    });
  }

  unlock(
    workspaceId: string,
    lockId: string,
    actorUserId: string,
  ): Promise<WorkspaceRangeLockSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(workspaceRangeLock)
        .where(
          and(eq(workspaceRangeLock.workspaceId, workspaceId), eq(workspaceRangeLock.id, lockId)),
        )
        .limit(1);
      const row = existing[0];
      if (!row) throw new Error("NOT_FOUND");
      if (row.unlockedAt) return mapRow(row);
      const updated = await tx
        .update(workspaceRangeLock)
        .set({
          unlockedAt: new Date(),
          unlockedByUserId: actorUserId,
        })
        .where(eq(workspaceRangeLock.id, lockId))
        .returning();
      return mapRow(updated[0]!);
    });
  }
}
