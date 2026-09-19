import type { ApprovalQueueItem } from "@dang/contracts";
import { apiFetch } from "./client";

export const approvalQueueApi = {
  listApprovalQueue: (workspaceId: string) =>
    apiFetch<ApprovalQueueItem[]>(
      `/workspaces/${workspaceId}/approval-queue`,
    ),
  /** Lightweight queue size for shell badge / home priority (no item payload). */
  approvalQueueCount: (workspaceId: string) =>
    apiFetch<{ count: number }>(
      `/workspaces/${workspaceId}/approval-queue/count`,
    ),
};
