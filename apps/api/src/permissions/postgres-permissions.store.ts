import {
  and,
  createDatabase,
  deputyFinanceWindow,
  eq,
  isNull,
  lte,
  gte,
  membershipPermissionOverride,
  workspaceRoleGrant,
  type AppDatabase,
} from "@dang/db";
import type { AccessGrant } from "@dang/contracts";
import type {
  DeputyWindowRecord,
  MemberOverrideRecord,
  PermissionsStore,
  RoleGrantRecord,
} from "./permissions.types.js";

function mapRole(row: typeof workspaceRoleGrant.$inferSelect): RoleGrantRecord {
  return {
    workspaceId: row.workspaceId,
    role: row.role,
    action: row.action,
    effect: row.effect as RoleGrantRecord["effect"],
    updatedByUserId: row.updatedByUserId ?? null,
    updatedAt: row.updatedAt,
  };
}

function mapMember(row: typeof membershipPermissionOverride.$inferSelect): MemberOverrideRecord {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    action: row.action,
    effect: row.effect as MemberOverrideRecord["effect"],
    updatedByUserId: row.updatedByUserId ?? null,
    updatedAt: row.updatedAt,
  };
}

function mapWindow(row: typeof deputyFinanceWindow.$inferSelect): DeputyWindowRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reason: row.reason,
    approvalCapMinor: row.approvalCapMinor ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt ?? null,
  };
}

export class PostgresPermissionsStore implements PermissionsStore {
  readonly persistence = "postgres" as const;
  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresPermissionsStore {
    const { db } = createDatabase(url);
    return new PostgresPermissionsStore(db);
  }

  async listRoleGrants(workspaceId: string, role?: string): Promise<RoleGrantRecord[]> {
    const rows = role
      ? await this.db
          .select()
          .from(workspaceRoleGrant)
          .where(
            and(
              eq(workspaceRoleGrant.workspaceId, workspaceId),
              eq(workspaceRoleGrant.role, role),
            ),
          )
      : await this.db
          .select()
          .from(workspaceRoleGrant)
          .where(eq(workspaceRoleGrant.workspaceId, workspaceId));
    return rows.map(mapRole);
  }

  async replaceRoleGrants(
    workspaceId: string,
    role: string,
    grants: AccessGrant[],
    updatedByUserId: string,
  ): Promise<RoleGrantRecord[]> {
    await this.db
      .delete(workspaceRoleGrant)
      .where(
        and(
          eq(workspaceRoleGrant.workspaceId, workspaceId),
          eq(workspaceRoleGrant.role, role),
        ),
      );
    if (!grants.length) return [];
    const inserted = await this.db
      .insert(workspaceRoleGrant)
      .values(
        grants.map((g) => ({
          workspaceId,
          role,
          action: g.action,
          effect: g.effect,
          updatedByUserId,
        })),
      )
      .returning();
    return inserted.map(mapRole);
  }

  async listMemberOverrides(
    workspaceId: string,
    userId?: string,
  ): Promise<MemberOverrideRecord[]> {
    const rows = userId
      ? await this.db
          .select()
          .from(membershipPermissionOverride)
          .where(
            and(
              eq(membershipPermissionOverride.workspaceId, workspaceId),
              eq(membershipPermissionOverride.userId, userId),
            ),
          )
      : await this.db
          .select()
          .from(membershipPermissionOverride)
          .where(eq(membershipPermissionOverride.workspaceId, workspaceId));
    return rows.map(mapMember);
  }

  async replaceMemberOverrides(
    workspaceId: string,
    userId: string,
    grants: AccessGrant[],
    updatedByUserId: string,
  ): Promise<MemberOverrideRecord[]> {
    await this.db
      .delete(membershipPermissionOverride)
      .where(
        and(
          eq(membershipPermissionOverride.workspaceId, workspaceId),
          eq(membershipPermissionOverride.userId, userId),
        ),
      );
    if (!grants.length) return [];
    const inserted = await this.db
      .insert(membershipPermissionOverride)
      .values(
        grants.map((g) => ({
          workspaceId,
          userId,
          action: g.action,
          effect: g.effect,
          updatedByUserId,
        })),
      )
      .returning();
    return inserted.map(mapMember);
  }

  async listDeputyWindows(workspaceId: string): Promise<DeputyWindowRecord[]> {
    const rows = await this.db
      .select()
      .from(deputyFinanceWindow)
      .where(eq(deputyFinanceWindow.workspaceId, workspaceId));
    return rows.map(mapWindow).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  }

  async createDeputyWindow(input: {
    workspaceId: string;
    userId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    approvalCapMinor?: string | null;
    createdByUserId: string;
  }): Promise<DeputyWindowRecord> {
    const inserted = await this.db
      .insert(deputyFinanceWindow)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
        approvalCapMinor: input.approvalCapMinor ?? null,
        createdByUserId: input.createdByUserId,
      })
      .returning();
    return mapWindow(inserted[0]!);
  }

  async revokeDeputyWindow(id: string, workspaceId: string): Promise<DeputyWindowRecord | null> {
    const updated = await this.db
      .update(deputyFinanceWindow)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(deputyFinanceWindow.id, id), eq(deputyFinanceWindow.workspaceId, workspaceId)),
      )
      .returning();
    return updated[0] ? mapWindow(updated[0]) : null;
  }

  async findActiveDeputyWindow(
    workspaceId: string,
    userId: string,
    now = new Date(),
  ): Promise<DeputyWindowRecord | null> {
    const rows = await this.db
      .select()
      .from(deputyFinanceWindow)
      .where(
        and(
          eq(deputyFinanceWindow.workspaceId, workspaceId),
          eq(deputyFinanceWindow.userId, userId),
          isNull(deputyFinanceWindow.revokedAt),
          lte(deputyFinanceWindow.startsAt, now),
          gte(deputyFinanceWindow.endsAt, now),
        ),
      )
      .limit(1);
    return rows[0] ? mapWindow(rows[0]) : null;
  }
}
