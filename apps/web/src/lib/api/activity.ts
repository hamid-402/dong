import type { ActivityPage } from "@dang/contracts";
import { apiFetch } from "./client";

export const activityApi = {
  listActivity: (
    workspaceId: string,
    query?: { cursor?: string; limit?: number },
  ) => {
    const sp = new URLSearchParams();
    if (query?.cursor) sp.set("cursor", query.cursor);
    if (query?.limit != null) sp.set("limit", String(query.limit));
    const qs = sp.toString();
    return apiFetch<ActivityPage>(
      `/workspaces/${workspaceId}/activity${qs ? `?${qs}` : ""}`,
    );
  },
};
