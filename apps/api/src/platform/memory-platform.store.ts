import type {
  BreakGlassRow,
  PendingRoleChange,
  PlatformBreakGlassStore,
} from "./platform.types.js";

export class MemoryPlatformBreakGlassStore implements PlatformBreakGlassStore {
  readonly persistence = "memory" as const;
  private readonly rows: BreakGlassRow[] = [];
  private readonly pending = new Map<string, PendingRoleChange>();

  open(input: {
    actorUserId: string;
    workspaceId: string;
    reason: string;
    expiresAt: Date;
    ticketRef?: string | null;
  }): Promise<BreakGlassRow> {
    const row: BreakGlassRow = {
      id: crypto.randomUUID(),
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      reason: input.reason,
      grantedAt: new Date(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      ticketRef: input.ticketRef ?? null,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  revoke(id: string, _actorUserId: string): Promise<BreakGlassRow | null> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return Promise.resolve(null);
    if (!row.revokedAt) row.revokedAt = new Date();
    return Promise.resolve(row);
  }

  findById(id: string): Promise<BreakGlassRow | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }

  list(input?: { cursor?: string; limit?: number }): Promise<{
    items: BreakGlassRow[];
    nextCursor?: string;
  }> {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);
    const offset = Math.max(Number.parseInt(input?.cursor ?? "0", 10) || 0, 0);
    const sorted = [...this.rows].sort(
      (a, b) => b.grantedAt.getTime() - a.grantedAt.getTime(),
    );
    const items = sorted.slice(offset, offset + limit);
    const next = offset + items.length;
    return Promise.resolve({
      items,
      nextCursor: next < sorted.length ? String(next) : undefined,
    });
  }

  findActive(
    actorUserId: string,
    workspaceId: string,
    now = new Date(),
  ): Promise<BreakGlassRow | null> {
    const row = this.rows.find(
      (r) =>
        r.actorUserId === actorUserId &&
        r.workspaceId === workspaceId &&
        !r.revokedAt &&
        r.expiresAt.getTime() > now.getTime(),
    );
    return Promise.resolve(row ?? null);
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
