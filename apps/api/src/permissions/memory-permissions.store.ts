import type { AccessGrant } from "@dang/contracts";
import type {
  DeputyWindowRecord,
  MemberOverrideRecord,
  PermissionsStore,
  RoleGrantRecord,
} from "./permissions.types.js";

export class MemoryPermissionsStore implements PermissionsStore {
  readonly persistence = "memory" as const;
  private roleGrants: RoleGrantRecord[] = [];
  private memberOverrides: MemberOverrideRecord[] = [];
  private windows: DeputyWindowRecord[] = [];

  listRoleGrants(workspaceId: string, role?: string): Promise<RoleGrantRecord[]> {
    return Promise.resolve(
      this.roleGrants.filter(
        (g) => g.workspaceId === workspaceId && (role ? g.role === role : true),
      ),
    );
  }

  replaceRoleGrants(
    workspaceId: string,
    role: string,
    grants: AccessGrant[],
    updatedByUserId: string,
  ): Promise<RoleGrantRecord[]> {
    this.roleGrants = this.roleGrants.filter(
      (g) => !(g.workspaceId === workspaceId && g.role === role),
    );
    const now = new Date();
    const next = grants.map((g) => ({
      workspaceId,
      role,
      action: g.action,
      effect: g.effect,
      updatedByUserId,
      updatedAt: now,
    }));
    this.roleGrants.push(...next);
    return Promise.resolve(next);
  }

  listMemberOverrides(workspaceId: string, userId?: string): Promise<MemberOverrideRecord[]> {
    return Promise.resolve(
      this.memberOverrides.filter(
        (g) => g.workspaceId === workspaceId && (userId ? g.userId === userId : true),
      ),
    );
  }

  replaceMemberOverrides(
    workspaceId: string,
    userId: string,
    grants: AccessGrant[],
    updatedByUserId: string,
  ): Promise<MemberOverrideRecord[]> {
    this.memberOverrides = this.memberOverrides.filter(
      (g) => !(g.workspaceId === workspaceId && g.userId === userId),
    );
    const now = new Date();
    const next = grants.map((g) => ({
      workspaceId,
      userId,
      action: g.action,
      effect: g.effect,
      updatedByUserId,
      updatedAt: now,
    }));
    this.memberOverrides.push(...next);
    return Promise.resolve(next);
  }

  listDeputyWindows(workspaceId: string): Promise<DeputyWindowRecord[]> {
    return Promise.resolve(
      this.windows
        .filter((w) => w.workspaceId === workspaceId)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()),
    );
  }

  createDeputyWindow(input: {
    workspaceId: string;
    userId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    approvalCapMinor?: string | null;
    createdByUserId: string;
  }): Promise<DeputyWindowRecord> {
    const row: DeputyWindowRecord = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason,
      approvalCapMinor: input.approvalCapMinor ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
      revokedAt: null,
    };
    this.windows.push(row);
    return Promise.resolve(row);
  }

  revokeDeputyWindow(id: string, workspaceId: string): Promise<DeputyWindowRecord | null> {
    const row = this.windows.find((w) => w.id === id && w.workspaceId === workspaceId);
    if (!row) return Promise.resolve(null);
    row.revokedAt = new Date();
    return Promise.resolve(row);
  }

  findActiveDeputyWindow(
    workspaceId: string,
    userId: string,
    now = new Date(),
  ): Promise<DeputyWindowRecord | null> {
    const t = now.getTime();
    const row = this.windows.find(
      (w) =>
        w.workspaceId === workspaceId &&
        w.userId === userId &&
        !w.revokedAt &&
        w.startsAt.getTime() <= t &&
        w.endsAt.getTime() >= t,
    );
    return Promise.resolve(row ?? null);
  }
}
