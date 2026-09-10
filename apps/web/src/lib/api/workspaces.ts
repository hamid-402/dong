import type {
  CreateInviteRequest,
  CreateInviteResponse,
  CreateOutingRequest,
  CreateWorkspaceRequest,
  MembershipSummary,
  OutingSummary,
  UpdateWorkspaceRequest,
  WorkspaceSummary,
  WorkspaceTemplateCatalogItem,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Workspace, membership, outing and invite endpoints — domain slice (dong-50 #30). */
export const workspacesApi = {
  templates: () => apiFetch<WorkspaceTemplateCatalogItem[]>("/workspaces/templates"),
  listWorkspaces: () => apiFetch<WorkspaceSummary[]>("/workspaces"),
  getWorkspace: (workspaceId: string) =>
    apiFetch<WorkspaceSummary>(`/workspaces/${workspaceId}`),
  createWorkspace: (body: CreateWorkspaceRequest, idempotencyKey?: string) =>
    apiFetch<WorkspaceSummary>(
      "/workspaces",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      idempotencyKey,
    ),
  updateWorkspace: (workspaceId: string, body: UpdateWorkspaceRequest) =>
    apiFetch<WorkspaceSummary>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listMembers: (workspaceId: string) =>
    apiFetch<MembershipSummary[]>(`/workspaces/${workspaceId}/members`),
  setMemberDefaultShares: (workspaceId: string, userId: string, defaultShares: number) =>
    apiFetch<MembershipSummary>(
      `/workspaces/${workspaceId}/members/${userId}/default-shares`,
      {
        method: "PATCH",
        body: JSON.stringify({ defaultShares }),
      },
    ),
  listOutings: (workspaceId: string) =>
    apiFetch<OutingSummary[]>(`/workspaces/${workspaceId}/outings`),
  createOuting: (workspaceId: string, body: CreateOutingRequest) =>
    apiFetch<OutingSummary>(`/workspaces/${workspaceId}/outings`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getOuting: (workspaceId: string, outingId: string) =>
    apiFetch<OutingSummary>(`/workspaces/${workspaceId}/outings/${outingId}`),
  createInvite: (workspaceId: string, body: CreateInviteRequest, idempotencyKey?: string) =>
    apiFetch<CreateInviteResponse>(
      `/workspaces/${workspaceId}/invites`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      idempotencyKey,
    ),
  acceptInvite: (token: string) =>
    apiFetch<WorkspaceSummary>("/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
};
