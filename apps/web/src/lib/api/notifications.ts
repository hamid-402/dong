import type { NotificationSummary } from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Notification reads used by the shell. Kept out of the attachment/OCR module. */
export const notificationsApi = {
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
