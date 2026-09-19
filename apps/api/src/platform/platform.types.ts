import type { PlatformBreakGlassRecord } from "@dang/contracts";

export type BreakGlassRow = {
  id: string;
  actorUserId: string;
  workspaceId: string;
  reason: string;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  ticketRef: string | null;
};

export type PendingRoleChange = {
  id: string;
  targetUserId: string;
  platformRole: "platform_owner";
  requestedByUserId: string;
  createdAt: Date;
};

export type PlatformBreakGlassStore = {
  readonly persistence: "memory" | "postgres";
  open(input: {
    actorUserId: string;
    workspaceId: string;
    reason: string;
    expiresAt: Date;
    ticketRef?: string | null;
  }): Promise<BreakGlassRow>;
  revoke(id: string, actorUserId: string): Promise<BreakGlassRow | null>;
  findById(id: string): Promise<BreakGlassRow | null>;
  list(input?: { cursor?: string; limit?: number }): Promise<{
    items: BreakGlassRow[];
    nextCursor?: string;
  }>;
  findActive(actorUserId: string, workspaceId: string, now?: Date): Promise<BreakGlassRow | null>;
  createPendingRoleChange(input: {
    targetUserId: string;
    requestedByUserId: string;
  }): Promise<PendingRoleChange>;
  getPendingRoleChange(id: string): Promise<PendingRoleChange | null>;
  takePendingRoleChange(id: string): Promise<PendingRoleChange | null>;
};

export const PLATFORM_BREAK_GLASS_STORE = Symbol("PLATFORM_BREAK_GLASS_STORE");

export function toBreakGlassDto(row: BreakGlassRow, now = new Date()): PlatformBreakGlassRecord {
  const active =
    !row.revokedAt && row.expiresAt.getTime() > now.getTime();
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    workspaceId: row.workspaceId,
    reason: row.reason,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    ticketRef: row.ticketRef,
    active,
  };
}
