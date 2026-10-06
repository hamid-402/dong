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
  listWebhookDeliveries: (workspaceId: string, webhookId?: string) =>
    apiFetch<WorkspaceWebhookDeliverySummary[]>(
      webhookId
        ? `/workspaces/${workspaceId}/webhooks/${webhookId}/deliveries`
        : `/workspaces/${workspaceId}/webhooks/deliveries`,
    ),
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
