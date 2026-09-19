import {
  and,
  createDatabase,
  desc,
  eq,
  gt,
  isNull,
  platformBreakGlass,
  type AppDatabase,
} from "@dang/db";
import type {
  BreakGlassRow,
  PendingRoleChange,
  PlatformBreakGlassStore,
} from "./platform.types.js";

function mapRow(row: typeof platformBreakGlass.$inferSelect): BreakGlassRow {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    workspaceId: row.workspaceId,
    reason: row.reason,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? null,
    ticketRef: row.ticketRef ?? null,
  };
}

/**
 * Pending role elevations stay in-process (short-lived maker-checker handoff).
 * Durable state is break-glass rows in Postgres.
 */
export class PostgresPlatformBreakGlassStore implements PlatformBreakGlassStore {
  readonly persistence = "postgres" as const;
  private readonly pending = new Map<string, PendingRoleChange>();

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresPlatformBreakGlassStore {
    const { db } = createDatabase(url);
    return new PostgresPlatformBreakGlassStore(db);
  }

  async open(input: {
    actorUserId: string;
    workspaceId: string;
    reason: string;
    expiresAt: Date;
    ticketRef?: string | null;
  }): Promise<BreakGlassRow> {
    const inserted = await this.db
      .insert(platformBreakGlass)
      .values({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        reason: input.reason,
        expiresAt: input.expiresAt,
        ticketRef: input.ticketRef ?? null,
      })
      .returning();
    return mapRow(inserted[0]!);
  }

  async revoke(id: string, _actorUserId: string): Promise<BreakGlassRow | null> {
    const updated = await this.db
      .update(platformBreakGlass)
      .set({ revokedAt: new Date() })
      .where(and(eq(platformBreakGlass.id, id), isNull(platformBreakGlass.revokedAt)))
      .returning();
    if (updated[0]) return mapRow(updated[0]);
    const existing = await this.findById(id);
    return existing;
  }

  async findById(id: string): Promise<BreakGlassRow | null> {
    const rows = await this.db
      .select()
      .from(platformBreakGlass)
      .where(eq(platformBreakGlass.id, id))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async list(input?: { cursor?: string; limit?: number }): Promise<{
    items: BreakGlassRow[];
    nextCursor?: string;
  }> {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const offset = Math.max(Number.parseInt(input?.cursor ?? "0", 10) || 0, 0);
    const rows = await this.db
      .select()
      .from(platformBreakGlass)
      .orderBy(desc(platformBreakGlass.grantedAt))
      .limit(limit + 1)
      .offset(offset);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(mapRow),
      nextCursor: hasMore ? String(offset + page.length) : undefined,
    };
  }

  async findActive(
    actorUserId: string,
    workspaceId: string,
    now = new Date(),
  ): Promise<BreakGlassRow | null> {
    const rows = await this.db
      .select()
      .from(platformBreakGlass)
      .where(
        and(
          eq(platformBreakGlass.actorUserId, actorUserId),
          eq(platformBreakGlass.workspaceId, workspaceId),
          isNull(platformBreakGlass.revokedAt),
          gt(platformBreakGlass.expiresAt, now),
        ),
      )
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  createPendingRoleChange(input: {
    targetUserId: string;
    requestedByUserId: string;
  }): Promise<PendingRoleChange> {
    const row: PendingRoleChange = {
      id: crypto.randomUUID(),
      targetUserId: input.targetUserId,
      platformRole: "platform_owner",
      requestedByUserId: input.requestedByUserId,
      createdAt: new Date(),
    };
    this.pending.set(row.id, row);
    return Promise.resolve(row);
  }

  getPendingRoleChange(id: string): Promise<PendingRoleChange | null> {
    return Promise.resolve(this.pending.get(id) ?? null);
  }

  takePendingRoleChange(id: string): Promise<PendingRoleChange | null> {
    const row = this.pending.get(id) ?? null;
    if (row) this.pending.delete(id);
    return Promise.resolve(row);
  }
}
