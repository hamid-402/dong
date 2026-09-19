import type { AddWorkspaceMemberBody, ApproveJoinRequestBody, ClaimGuestPlaceholderRequest, ClaimGuestPlaceholderResponse, CreateGuestPlaceholderRequest, CreateInviteRequest, CreateInviteResponse, CreateJoinRequestBody, CreateOutingRequest, CreateSplitPresetRequest, CreateWorkspaceRequest, CreateWorkspaceSubunitBody, DisableWorkspaceMemberBody, GuestPlaceholderSummary, JoinRequestSummary, MembershipSummary, OutingSummary, OwnershipTransferSummary, ProposeOwnershipTransferBody, SplitPresetSummary, UpdateWorkspaceMemberBody, UpdateWorkspaceRequest, UpdateWorkspaceSubunitBody, WorkspaceJoinPreview, WorkspaceSubunitSummary, WorkspaceSummary, WorkspaceTemplateCatalogItem } from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Workspace, membership, outing and invite endpoints — domain slice (dong-50 #30). */
export const workspacesApi = {
  templates: () => apiFetch<WorkspaceTemplateCatalogItem[]>("/workspaces/templates"),
  listWorkspaces: () => apiFetch<WorkspaceSummary[]>("/workspaces"),
  getWorkspace: (workspaceId: string) =>
    apiFetch<WorkspaceSummary>(`/workspaces/${workspaceId}`),
  createWorkspace: (body: CreateWorkspaceRequest, idempotencyKey?: string) =>
    postWithOfflineQueue<WorkspaceSummary>({
      path: "/workspaces",
      body: JSON.stringify(body),
      idempotencyKey,
      label: body.name?.trim() || "ایجاد فضای کاری",
    }),
  listGuestPlaceholders: (workspaceId: string) =>
    apiFetch<GuestPlaceholderSummary[]>(
      `/workspaces/${workspaceId}/guest-placeholders`,
    ),
  createGuestPlaceholder: (
    workspaceId: string,
    body: CreateGuestPlaceholderRequest,
  ) =>
    postWithOfflineQueue<GuestPlaceholderSummary>({
      path: `/workspaces/${workspaceId}/guest-placeholders`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.displayName?.trim() || "مهمان",
    }),
  claimGuestPlaceholder: (
    body: ClaimGuestPlaceholderRequest,
  ) =>
    apiFetch<ClaimGuestPlaceholderResponse>(
      `/guest-placeholders/claim`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listSplitPresets: (workspaceId: string) =>
    apiFetch<SplitPresetSummary[]>(
      `/workspaces/${workspaceId}/split-presets`,
    ),
  createSplitPreset: (
    workspaceId: string,
    body: CreateSplitPresetRequest,
  ) =>
    postWithOfflineQueue<SplitPresetSummary>({
      path: `/workspaces/${workspaceId}/split-presets`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "قالب سهم",
    }),
  updateWorkspace: (workspaceId: string, body: UpdateWorkspaceRequest) =>
    apiFetch<WorkspaceSummary>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listMembers: (workspaceId: string) =>
    apiFetch<MembershipSummary[]>(`/workspaces/${workspaceId}/members`),
  addMember: (workspaceId: string, body: AddWorkspaceMemberBody, idempotencyKey?: string) =>
    postWithOfflineQueue<MembershipSummary>({
      path: `/workspaces/${workspaceId}/members`,
      body: JSON.stringify(body),
      idempotencyKey,
      label: "افزودن عضو",
    }),
  updateMember: (workspaceId: string, userId: string, body: UpdateWorkspaceMemberBody) =>
    apiFetch<MembershipSummary>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  disableMember: (workspaceId: string, userId: string, body: DisableWorkspaceMemberBody) =>
    postWithOfflineQueue<MembershipSummary>({
      path: `/workspaces/${workspaceId}/members/${userId}/disable`,
      body: JSON.stringify(body),
      label: "غیرفعال‌سازی عضو",
    }),
  enableMember: (workspaceId: string, userId: string) =>
    postWithOfflineQueue<MembershipSummary>({
      path: `/workspaces/${workspaceId}/members/${userId}/enable`,
      label: "فعال‌سازی عضو",
    }),
  listJoinRequests: (workspaceId: string) =>
    apiFetch<JoinRequestSummary[]>(`/workspaces/${workspaceId}/join-requests`),
  createJoinRequest: (slug: string, body: CreateJoinRequestBody, idempotencyKey?: string) =>
    postWithOfflineQueue<JoinRequestSummary>({
      path: `/workspaces/${encodeURIComponent(slug)}/join-requests`,
      body: JSON.stringify(body),
      idempotencyKey,
      label: "درخواست عضویت",
    }),
  previewWorkspaceBySlug: (slug: string) =>
    apiFetch<WorkspaceJoinPreview>(
      `/workspaces/by-slug/${encodeURIComponent(slug)}`,
    ),
  approveJoinRequest: (
    workspaceId: string,
    reqId: string,
    body: ApproveJoinRequestBody,
  ) =>
    postWithOfflineQueue<JoinRequestSummary>({
      path: `/workspaces/${workspaceId}/join-requests/${reqId}/approve`,
      body: JSON.stringify(body),
      label: "تأیید درخواست عضویت",
    }),
  rejectJoinRequest: (workspaceId: string, reqId: string) =>
    postWithOfflineQueue<JoinRequestSummary>({
      path: `/workspaces/${workspaceId}/join-requests/${reqId}/reject`,
      label: "رد درخواست عضویت",
    }),
  withdrawJoinRequest: (reqId: string) =>
    apiFetch<JoinRequestSummary>(`/join-requests/${reqId}`, {
      method: "DELETE",
    }),
  proposeOwnershipTransfer: (
    workspaceId: string,
    body: ProposeOwnershipTransferBody,
  ) =>
    postWithOfflineQueue<OwnershipTransferSummary>({
      path: `/workspaces/${workspaceId}/ownership-transfer`,
      body: JSON.stringify(body),
      label: "پیشنهاد انتقال مالکیت",
    }),
  listOwnershipTransfers: (workspaceId: string) =>
    apiFetch<OwnershipTransferSummary[]>(
      `/workspaces/${workspaceId}/ownership-transfer`,
    ),
  listSubunits: (workspaceId: string) =>
    apiFetch<WorkspaceSubunitSummary[]>(
      `/workspaces/${workspaceId}/subunits`,
    ),
  createSubunit: (
    workspaceId: string,
    body: CreateWorkspaceSubunitBody,
  ) =>
    apiFetch<WorkspaceSubunitSummary>(
      `/workspaces/${workspaceId}/subunits`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateSubunit: (
    workspaceId: string,
    subunitId: string,
    body: UpdateWorkspaceSubunitBody,
  ) =>
    apiFetch<WorkspaceSubunitSummary>(
      `/workspaces/${workspaceId}/subunits/${subunitId}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteSubunit: (workspaceId: string, subunitId: string) =>
    apiFetch<void>(`/workspaces/${workspaceId}/subunits/${subunitId}`, {
      method: "DELETE",
    }),
  acceptOwnershipTransfer: (workspaceId: string, tid: string) =>
    postWithOfflineQueue<OwnershipTransferSummary>({
      path: `/workspaces/${workspaceId}/ownership-transfer/${tid}/accept`,
      label: "پذیرش انتقال مالکیت",
    }),
  cancelOwnershipTransfer: (workspaceId: string, tid: string) =>
    postWithOfflineQueue<OwnershipTransferSummary>({
      path: `/workspaces/${workspaceId}/ownership-transfer/${tid}/cancel`,
      label: "لغو انتقال مالکیت",
    }),
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
    postWithOfflineQueue<OutingSummary>({
      path: `/workspaces/${workspaceId}/outings`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.title?.trim() || "ایجاد گشت",
    }),
  getOuting: (workspaceId: string, outingId: string) =>
    apiFetch<OutingSummary>(`/workspaces/${workspaceId}/outings/${outingId}`),
  createInvite: (workspaceId: string, body: CreateInviteRequest, idempotencyKey?: string) =>
    postWithOfflineQueue<CreateInviteResponse>({
      path: `/workspaces/${workspaceId}/invites`,
      body: JSON.stringify(body),
      idempotencyKey,
      label: "ایجاد دعوت‌نامه",
    }),
  acceptInvite: (token: string) =>
    postWithOfflineQueue<WorkspaceSummary>({
      path: "/invites/accept",
      body: JSON.stringify({ token }),
      label: "پذیرش دعوت‌نامه",
    }),
};
