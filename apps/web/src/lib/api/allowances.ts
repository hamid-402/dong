import type {
  CreateMemberAllowanceRequest,
  MemberAllowanceSummary,
  MemberAllowanceUsage,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const allowancesApi = {
  listAllowances: (workspaceId: string) =>
    apiFetch<MemberAllowanceSummary[]>(`/workspaces/${workspaceId}/allowances`),
  createAllowance: (
    workspaceId: string,
    body: CreateMemberAllowanceRequest,
  ) =>
    apiFetch<MemberAllowanceSummary>(
      `/workspaces/${workspaceId}/allowances`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  getAllowanceUsage: (workspaceId: string) =>
    apiFetch<MemberAllowanceUsage[]>(
      `/workspaces/${workspaceId}/allowances/usage`,
    ),
};
