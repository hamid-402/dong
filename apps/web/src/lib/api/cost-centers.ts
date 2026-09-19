import type {
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

export const costCentersApi = {
  listCostCenters: (workspaceId: string) =>
    apiFetch<CostCenterSummary[]>(
      `/workspaces/${workspaceId}/cost-centers`,
    ),
  createCostCenter: (
    workspaceId: string,
    body: CreateCostCenterRequest,
  ) =>
    postWithOfflineQueue<CostCenterSummary>({
      path: `/workspaces/${workspaceId}/cost-centers`,
      body: JSON.stringify(body),
      label: body.name?.trim() || "ایجاد مرکز هزینه",
    }),
};
