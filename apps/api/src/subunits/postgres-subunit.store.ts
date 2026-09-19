import {
  and,
  createDatabase,
  eq,
  inArray,
  withTenantContext,
  workspaceSubunit,
  workspaceSubunitMember,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateWorkspaceSubunitBody,
  UpdateWorkspaceSubunitBody,
  WorkspaceSubunitKind,
  WorkspaceSubunitSummary,
} from "@dang/contracts";
import type { WorkspaceSubunitStore } from "./subunit.types.js";

export class PostgresWorkspaceSubunitStore implements WorkspaceSubunitStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresWorkspaceSubunitStore {
    return new PostgresWorkspaceSubunitStore(createDatabase(url).db);
  }

  async list(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceSubunitSummary[]> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const rows = await tx
        .select()
        .from(workspaceSubunit)
        .where(eq(workspaceSubunit.workspaceId, workspaceId));
      const ids = rows.map((r) => r.id);
      const members =
        ids.length === 0
          ? []
          : await tx
              .select()
              .from(workspaceSubunitMember)
              .where(inArray(workspaceSubunitMember.subunitId, ids));
      const bySub = new Map<string, string[]>();
      for (const m of members) {
        const list = bySub.get(m.subunitId) ?? [];
        list.push(m.userId);
        bySub.set(m.subunitId, list);
      }
      return rows
        .map((row) => mapRow(row, bySub.get(row.id) ?? []))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    });
  }

  async create(
    workspaceId: string,
    actorUserId: string,
    body: CreateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const existing = await tx
        .select({ id: workspaceSubunit.id })
        .from(workspaceSubunit)
        .where(
          and(
            eq(workspaceSubunit.workspaceId, workspaceId),
            eq(workspaceSubunit.code, body.code.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) throw new Error("SUBUNIT_CODE_EXISTS");

      const inserted = await tx
        .insert(workspaceSubunit)
        .values({
          workspaceId,
          kind: body.kind,
          code: body.code.trim(),
          name: body.name.trim(),
          note: body.note?.trim() || null,
          sortOrder: body.sortOrder ?? 0,
          areaSqm: body.areaSqm != null ? String(body.areaSqm) : null,
          occupancy: body.occupancy ?? null,
        })
        .returning();
      const row = inserted[0]!;
      return mapRow(row, []);
    });
  }

  async update(
    workspaceId: string,
    subunitId: string,
    actorUserId: string,
    body: UpdateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const found = await tx
        .select()
        .from(workspaceSubunit)
        .where(
          and(
            eq(workspaceSubunit.id, subunitId),
            eq(workspaceSubunit.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!found[0]) throw new Error("SUBUNIT_NOT_FOUND");

      const patched = await tx
        .update(workspaceSubunit)
        .set({
          name: body.name?.trim() ?? found[0].name,
          note:
            body.note === undefined
              ? found[0].note
              : body.note?.trim() || null,
          sortOrder: body.sortOrder ?? found[0].sortOrder,
          areaSqm:
            body.areaSqm === undefined
              ? found[0].areaSqm
              : body.areaSqm == null
                ? null
                : String(body.areaSqm),
          occupancy:
            body.occupancy === undefined ? found[0].occupancy : body.occupancy,
        })
        .where(eq(workspaceSubunit.id, subunitId))
        .returning();

      if (body.memberUserIds) {
        await tx
          .delete(workspaceSubunitMember)
          .where(eq(workspaceSubunitMember.subunitId, subunitId));
        if (body.memberUserIds.length > 0) {
          await tx.insert(workspaceSubunitMember).values(
            body.memberUserIds.map((userId) => ({
              subunitId,
              userId,
            })),
          );
        }
      }

      const members = await tx
        .select()
        .from(workspaceSubunitMember)
        .where(eq(workspaceSubunitMember.subunitId, subunitId));
      return mapRow(
        patched[0]!,
        members.map((m) => m.userId),
      );
    });
  }

  async remove(
    workspaceId: string,
    subunitId: string,
    actorUserId: string,
  ): Promise<void> {
    await withTenantContext(this.db, { workspaceId, userId: actorUserId }, async (tx) => {
      const deleted = await tx
        .delete(workspaceSubunit)
        .where(
          and(
            eq(workspaceSubunit.id, subunitId),
            eq(workspaceSubunit.workspaceId, workspaceId),
          ),
        )
        .returning({ id: workspaceSubunit.id });
      if (!deleted[0]) throw new Error("SUBUNIT_NOT_FOUND");
    });
  }
}

function mapRow(
  row: typeof workspaceSubunit.$inferSelect,
  memberUserIds: string[],
): WorkspaceSubunitSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as WorkspaceSubunitKind,
    code: row.code,
    name: row.name,
    note: row.note ?? undefined,
    sortOrder: row.sortOrder,
    areaSqm:
      row.areaSqm != null && row.areaSqm !== ""
        ? Number(row.areaSqm)
        : undefined,
    occupancy: row.occupancy ?? undefined,
    memberUserIds,
    createdAt: row.createdAt.toISOString(),
  };
}
