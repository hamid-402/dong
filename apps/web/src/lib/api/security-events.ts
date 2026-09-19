import type { SecurityEventListPage } from "@dang/contracts";
import { apiFetch } from "./client";

/** Workspace-scoped security event listings (W1 UI depth). */
export const securityEventsApi = {
  listWorkspaceSecurityEvents: (
    workspaceId: string,
    params?: {
      cursor?: string;
      category?: string;
      severity?: string;
      limit?: number;
    },
  ) => {
    const q = new URLSearchParams();
    if (params?.cursor) q.set("cursor", params.cursor);
    if (params?.category) q.set("category", params.category);
    if (params?.severity) q.set("severity", params.severity);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q}` : "";
    return apiFetch<SecurityEventListPage>(
      `/workspaces/${encodeURIComponent(workspaceId)}/security-events${suffix}`,
    );
  },
};
