import type {
  CreateMemberAllowanceRequest,
  MemberAllowanceSummary,
  MemberAllowanceUsage,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

export const allowancesApi = {
  listAllowances: (workspaceId: string) =>
    apiFetch<MemberAllowanceSummary[]>(`/workspaces/${workspaceId}/allowances`),
  createAllowance: (
    workspaceId: string,
    body: CreateMemberAllowanceRequest,
  ) =>
    postWithOfflineQueue<MemberAllowanceSummary>({
      path: `/workspaces/${workspaceId}/allowances`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد سقف هزینه",
    }),
  getAllowanceUsage: (workspaceId: string) =>
    apiFetch<MemberAllowanceUsage[]>(
      `/workspaces/${workspaceId}/allowances/usage`,
    ),
};
