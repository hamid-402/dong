import { apiFetch } from "@/lib/api/client";
import { postWithOfflineQueue } from "./offline-post";

export type AccessGrantDto = {
  action: string;
  effect: "allow" | "deny";
};

export type DeputyWindowDto = {
  id: string;
  workspaceId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  approvalCapMinor?: string;
  createdByUserId: string;
  createdAt: string;
  revokedAt?: string;
  active: boolean;
};

export type WorkspacePermissionsDto = {
  lockedActions: string[];
  grantableActions: string[];
  roleGrants: Array<{
    workspaceId: string;
    role: string;
    action: string;
    effect: "allow" | "deny";
    updatedByUserId: string | null;
    updatedAt: string | Date;
  }>;
  memberOverrides: Array<{
    workspaceId: string;
    userId: string;
    action: string;
    effect: "allow" | "deny";
    updatedByUserId: string | null;
    updatedAt: string | Date;
  }>;
  deputyWindows: DeputyWindowDto[];
};

export type PolicyAuditNoteDto = {
  policyId: string;
  action: string;
  effect: string;
  description: string;
  noteForActor: string;
  roleOnlyAllows: boolean;
};

export type PolicyAuditDto = {
  workspaceId: string;
  source: "builtin_registry";
  actorRole: string;
  policies: PolicyAuditNoteDto[];
};

export type PermissionsDryRunResult = {
  allowed: boolean;
  reason: string;
  code?: string;
  matched?: { source: string; effect: "allow" | "deny" };
  policyVersion?: string;
  action: string;
};

export const permissionsApi = {
  get: (workspaceId: string) =>
    apiFetch<WorkspacePermissionsDto>(`/workspaces/${encodeURIComponent(workspaceId)}/permissions`),

  getPolicyAudit: (workspaceId: string) =>
    apiFetch<PolicyAuditDto>(`/workspaces/${encodeURIComponent(workspaceId)}/policy-audit`),

  dryRun: (
    workspaceId: string,
    body: { userId: string; action: string; amountMinor?: string },
  ) =>
    apiFetch<PermissionsDryRunResult>(
      `/workspaces/${encodeURIComponent(workspaceId)}/permissions/dry-run`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  putRoleGrants: (workspaceId: string, role: string, grants: AccessGrantDto[]) =>
    apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}/permissions/roles/${encodeURIComponent(role)}`, {
      method: "PUT",
      body: JSON.stringify({ grants }),
    }),

  putMemberOverrides: (workspaceId: string, userId: string, grants: AccessGrantDto[]) =>
    apiFetch(
      `/workspaces/${encodeURIComponent(workspaceId)}/permissions/members/${encodeURIComponent(userId)}`,
      {
        method: "PUT",
        body: JSON.stringify({ grants }),
      },
    ),

  listDeputyWindows: (workspaceId: string) =>
    apiFetch<DeputyWindowDto[]>(`/workspaces/${encodeURIComponent(workspaceId)}/deputy-windows`),

  createDeputyWindow: (
    workspaceId: string,
    body: {
      userId: string;
      startsAt: string;
      endsAt: string;
      reason: string;
      approvalCapMinor?: string;
    },
  ) =>
    postWithOfflineQueue<DeputyWindowDto>({
      path: `/workspaces/${encodeURIComponent(workspaceId)}/deputy-windows`,
      body: JSON.stringify(body),
      label: "ایجاد پنجره نیابت",
    }),

  revokeDeputyWindow: (workspaceId: string, windowId: string) =>
    postWithOfflineQueue<DeputyWindowDto>({
      path: `/workspaces/${encodeURIComponent(workspaceId)}/deputy-windows/${encodeURIComponent(windowId)}/revoke`,
      label: "لغو پنجره نیابت",
    }),
};
