import type {
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const costCentersApi = {
  listCostCenters: (workspaceId: string) =>
    apiFetch<CostCenterSummary[]>(
      `/workspaces/${workspaceId}/cost-centers`,
    ),
  createCostCenter: (
    workspaceId: string,
    body: CreateCostCenterRequest,
  ) =>
    apiFetch<CostCenterSummary>(
      `/workspaces/${workspaceId}/cost-centers`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
