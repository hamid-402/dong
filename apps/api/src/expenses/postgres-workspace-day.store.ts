import {
  and,
  createDatabase,
  eq,
  gte,
  lte,
  workspaceDay,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { WorkspaceDaySummary } from "@dang/contracts";
import type { WorkspaceDayStore, WorkspaceDayUpsertInput } from "./workspace-day.store.js";

function formatDate(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapRow(row: typeof workspaceDay.$inferSelect): WorkspaceDaySummary {
  return {
    workspaceId: row.workspaceId,
    date: formatDate(row.dayOn),
    isHoliday: row.isHoliday,
    note: row.note ?? undefined,
    holidayReversedExpenseIds: [...(row.holidayReversedExpenseIds ?? [])],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PostgresWorkspaceDayStore implements WorkspaceDayStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresWorkspaceDayStore {
    const { db } = createDatabase(connectionString);
    return new PostgresWorkspaceDayStore(db);
  }

  listDays(
    workspaceId: string,
    actorUserId: string,
    from: string,
    to: string,
  ): Promise<WorkspaceDaySummary[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(workspaceDay)
        .where(
          and(
            eq(workspaceDay.workspaceId, workspaceId),
            gte(workspaceDay.dayOn, from),
            lte(workspaceDay.dayOn, to),
          ),
        );
      return rows.map(mapRow);
    });
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
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(workspaceDay)
        .where(and(eq(workspaceDay.workspaceId, workspaceId), eq(workspaceDay.dayOn, date)))
        .limit(1);
      const prev = existing[0];
      const isHoliday = input.isHoliday ?? prev?.isHoliday ?? false;
      const note =
        input.note === null
          ? null
          : input.note !== undefined
            ? input.note.trim() || null
            : (prev?.note ?? null);
      const holidayReversedExpenseIds =
        input.holidayReversedExpenseIds !== undefined
          ? input.holidayReversedExpenseIds
          : (prev?.holidayReversedExpenseIds ?? []);
      const now = new Date();
      if (prev) {
        const updated = await tx
          .update(workspaceDay)
          .set({
            isHoliday,
            note,
            holidayReversedExpenseIds,
            updatedByUserId: actorUserId,
            updatedAt: now,
          })
          .where(and(eq(workspaceDay.workspaceId, workspaceId), eq(workspaceDay.dayOn, date)))
          .returning();
        return mapRow(updated[0]!);
      }
      const inserted = await tx
        .insert(workspaceDay)
        .values({
          workspaceId,
          dayOn: date,
          isHoliday,
          note,
          holidayReversedExpenseIds,
          updatedByUserId: actorUserId,
          updatedAt: now,
        })
        .returning();
      return mapRow(inserted[0]!);
    });
  }
}
