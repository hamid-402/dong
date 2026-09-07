import type { ApprovalQueueItem } from "@dang/contracts";
import { apiFetch } from "./client";

export const approvalQueueApi = {
  listApprovalQueue: (workspaceId: string) =>
    apiFetch<ApprovalQueueItem[]>(
      `/workspaces/${workspaceId}/approval-queue`,
    ),
};
