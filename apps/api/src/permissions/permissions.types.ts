import type { AccessGrant, GrantEffect } from "@dang/contracts";

export type RoleGrantRecord = {
  workspaceId: string;
  role: string;
  action: string;
  effect: GrantEffect;
  updatedByUserId: string | null;
  updatedAt: Date;
};

export type MemberOverrideRecord = {
  workspaceId: string;
  userId: string;
  action: string;
  effect: GrantEffect;
  updatedByUserId: string | null;
  updatedAt: Date;
};

export type DeputyWindowRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  approvalCapMinor: string | null;
  createdByUserId: string;
  createdAt: Date;
  revokedAt: Date | null;
};

export type PermissionsStore = {
  readonly persistence: "memory" | "postgres";
  listRoleGrants(workspaceId: string, role?: string): Promise<RoleGrantRecord[]>;
  replaceRoleGrants(
    workspaceId: string,
    role: string,
    grants: AccessGrant[],
    updatedByUserId: string,
  ): Promise<RoleGrantRecord[]>;
  listMemberOverrides(workspaceId: string, userId?: string): Promise<MemberOverrideRecord[]>;
  replaceMemberOverrides(
    workspaceId: string,
    userId: string,
    grants: AccessGrant[],
    updatedByUserId: string,
  ): Promise<MemberOverrideRecord[]>;
  listDeputyWindows(workspaceId: string): Promise<DeputyWindowRecord[]>;
  createDeputyWindow(input: {
    workspaceId: string;
    userId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    approvalCapMinor?: string | null;
    createdByUserId: string;
  }): Promise<DeputyWindowRecord>;
  revokeDeputyWindow(id: string, workspaceId: string): Promise<DeputyWindowRecord | null>;
  findActiveDeputyWindow(
    workspaceId: string,
    userId: string,
    now?: Date,
  ): Promise<DeputyWindowRecord | null>;
};

export const PERMISSIONS_STORE = Symbol("PERMISSIONS_STORE");
