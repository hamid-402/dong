import type {
  CreateWorkspaceWebhookRequest,
  WorkspaceWebhookDeliverySummary,
  WorkspaceWebhookSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

export const webhooksApi = {
  listWebhooks: (workspaceId: string) =>
    apiFetch<WorkspaceWebhookSummary[]>(`/workspaces/${workspaceId}/webhooks`),
  listWebhookDeliveries: async (workspaceId: string, webhookId?: string) => {
    try {
      return await apiFetch<WorkspaceWebhookDeliverySummary[]>(
        webhookId
          ? `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries`
          : `/workspaces/${workspaceId}/webhooks/deliveries`,
      );
    } catch {
      /* Missing delivery table / transient 5xx — UI shows calm empty state. */
      return [] as WorkspaceWebhookDeliverySummary[];
    }
  },
  createWebhook: (workspaceId: string, body: CreateWorkspaceWebhookRequest) =>
    postWithOfflineQueue<WorkspaceWebhookSummary>({
      path: `/workspaces/${workspaceId}/webhooks`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت وب‌هوک",
    }),
  deactivateWebhook: (workspaceId: string, webhookId: string) =>
    postWithOfflineQueue<WorkspaceWebhookSummary>({
      path: `/workspaces/${workspaceId}/webhooks/${webhookId}/deactivate`,
      label: "غیرفعال‌سازی وب‌هوک",
    }),
};
