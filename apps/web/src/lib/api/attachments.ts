import type { AttachmentSummary, CommentSummary, CreateAttachmentRequest, CreateCommentRequest, NotificationSummary, OcrReceiptResult } from "@dang/contracts";
import {
  API_BASE,
  ApiError,
  apiFetch,
  encodeDevHeader,
  getAuthClientMode,
  getDevIdentity,
} from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Comment, attachment and notification endpoints — domain slice (dong-50 #30). */
export const attachmentsApi = {
  createComment: (workspaceId: string, body: CreateCommentRequest) =>
    postWithOfflineQueue<CommentSummary>({
      path: `/workspaces/${workspaceId}/comments`,
      body: JSON.stringify(body),
      label: "نظر",
    }),
  listComments: (
    workspaceId: string,
    targetType: CreateCommentRequest["targetType"],
    targetId: string,
  ) =>
    apiFetch<CommentSummary[]>(
      `/workspaces/${workspaceId}/comments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`,
    ),
  createAttachment: (workspaceId: string, body: CreateAttachmentRequest) =>
    postWithOfflineQueue<AttachmentSummary>({
      path: `/workspaces/${workspaceId}/attachments`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.fileName?.trim() || "پیوست",
    }),
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
  runAttachmentOcr: (workspaceId: string, attachmentId: string) =>
    apiFetch<OcrReceiptResult>(
      `/workspaces/${workspaceId}/attachments/${attachmentId}/ocr`,
      { method: "POST", body: "{}" },
    ),
  listNotifications: (workspaceId: string) =>
    apiFetch<NotificationSummary[]>(`/workspaces/${workspaceId}/notifications`),
  /** SSE path for fetch-stream client (R10-18). */
  notificationsStreamPath: (workspaceId: string) =>
    `/workspaces/${workspaceId}/notifications/stream`,
  markNotificationRead: (workspaceId: string, notificationId: string) =>
    postWithOfflineQueue<NotificationSummary>({
      path: `/workspaces/${workspaceId}/notifications/${notificationId}/read`,
      body: "{}",
      label: "خواندن اعلان",
    }),
};
