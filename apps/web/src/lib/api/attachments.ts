import type {
  AttachmentSummary,
  CommentSummary,
  CreateAttachmentRequest,
  CreateCommentRequest,
  NotificationSummary,
} from "@dang/contracts";
import {
  API_BASE,
  ApiError,
  apiFetch,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
} from "./client";

/** Comment, attachment and notification endpoints — domain slice (dong-50 #30). */
export const attachmentsApi = {
  createComment: (workspaceId: string, body: CreateCommentRequest) =>
    apiFetch<CommentSummary>(`/workspaces/${workspaceId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createAttachment: (workspaceId: string, body: CreateAttachmentRequest) =>
    apiFetch<AttachmentSummary>(
      `/workspaces/${workspaceId}/attachments`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listAttachments: (
    workspaceId: string,
    targetType: CreateAttachmentRequest["targetType"],
    targetId: string,
  ) =>
    apiFetch<AttachmentSummary[]>(
      `/workspaces/${workspaceId}/attachments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
    ),
  uploadAttachmentContent: (
    workspaceId: string,
    attachmentId: string,
    body: { contentBase64: string },
  ) =>
    apiFetch<AttachmentSummary>(
      `/workspaces/${workspaceId}/attachments/${attachmentId}/content`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  attachmentContentUrl: (workspaceId: string, attachmentId: string) =>
    `${API_BASE}/workspaces/${workspaceId}/attachments/${attachmentId}/content`,
  fetchAttachmentContent: async (workspaceId: string, attachmentId: string) => {
    const headers = new Headers({ Accept: "*/*" });
    if (getAuthClientMode() === "dev") {
      const identity = getDevIdentity();
      headers.set("x-dang-subject", encodeDevHeader(identity.subject));
      headers.set("x-dang-display-name", encodeDevHeader(identity.displayName));
    }
    const response = await fetch(
      `${API_BASE}/workspaces/${workspaceId}/attachments/${attachmentId}/content`,
      { headers, credentials: "include" },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new ApiError(detail || `Download ${response.status}`, response.status);
    }
    return response.blob();
  },
  listNotifications: (workspaceId: string) =>
    apiFetch<NotificationSummary[]>(`/workspaces/${workspaceId}/notifications`),
  markNotificationRead: (workspaceId: string, notificationId: string) =>
    apiFetch<NotificationSummary>(
      `/workspaces/${workspaceId}/notifications/${notificationId}/read`,
      { method: "POST", body: "{}" },
    ),
};
