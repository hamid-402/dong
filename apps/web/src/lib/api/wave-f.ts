import type {
  CategoryBudgetUsage,
  CreateCategoryBudgetRequest,
  CreateReimbursementRequest,
  EmailDigestFrequency,
  ExpenseCsvImportRequest,
  NotificationPreferenceSummary,
  ReimbursementSummary,
  UpdateWorkspaceExpensePolicyRequest,
  WorkspaceExpensePolicySummary,
  WorkspacePlanName,
  WorkspacePlanSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const waveFApi = {
  listReimbursements: (workspaceId: string) =>
    apiFetch<ReimbursementSummary[]>(`/workspaces/${workspaceId}/reimbursements`),
  createReimbursement: (workspaceId: string, body: CreateReimbursementRequest) =>
    apiFetch<ReimbursementSummary>(`/workspaces/${workspaceId}/reimbursements`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  submitReimbursement: (workspaceId: string, id: string) =>
    apiFetch<ReimbursementSummary>(
      `/workspaces/${workspaceId}/reimbursements/${id}/submit`,
      { method: "POST" },
    ),
  approveReimbursement: (workspaceId: string, id: string, note?: string) =>
    apiFetch<ReimbursementSummary>(
      `/workspaces/${workspaceId}/reimbursements/${id}/approve`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  rejectReimbursement: (workspaceId: string, id: string, note?: string) =>
    apiFetch<ReimbursementSummary>(
      `/workspaces/${workspaceId}/reimbursements/${id}/reject`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  markReimbursementPaid: (workspaceId: string, id: string) =>
    apiFetch<ReimbursementSummary>(
      `/workspaces/${workspaceId}/reimbursements/${id}/mark-paid`,
      { method: "POST" },
    ),
  cancelReimbursement: (workspaceId: string, id: string) =>
    apiFetch<ReimbursementSummary>(
      `/workspaces/${workspaceId}/reimbursements/${id}/cancel`,
      { method: "POST" },
    ),
  listCategoryBudgetUsage: (workspaceId: string) =>
    apiFetch<CategoryBudgetUsage[]>(
      `/workspaces/${workspaceId}/category-budgets/usage`,
    ),
  createCategoryBudget: (workspaceId: string, body: CreateCategoryBudgetRequest) =>
    apiFetch<CategoryBudgetUsage>(`/workspaces/${workspaceId}/category-budgets`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getExpensePolicy: (workspaceId: string) =>
    apiFetch<WorkspaceExpensePolicySummary>(
      `/workspaces/${workspaceId}/expense-policy`,
    ),
  putExpensePolicy: (
    workspaceId: string,
    body: UpdateWorkspaceExpensePolicyRequest,
  ) =>
    apiFetch<WorkspaceExpensePolicySummary>(
      `/workspaces/${workspaceId}/expense-policy`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  getNotificationPrefs: () =>
    apiFetch<NotificationPreferenceSummary>("/me/notification-prefs"),
  putNotificationPrefs: (emailDigest: EmailDigestFrequency) =>
    apiFetch<NotificationPreferenceSummary>("/me/notification-prefs", {
      method: "PUT",
      body: JSON.stringify({ emailDigest }),
    }),
  getWorkspacePlan: (workspaceId: string) =>
    apiFetch<WorkspacePlanSummary>(`/workspaces/${workspaceId}/plan`),
  putWorkspacePlan: (
    workspaceId: string,
    body: {
      plan: WorkspacePlanName;
      seatsLimit?: number | null;
      features?: string[];
    },
  ) =>
    apiFetch<WorkspacePlanSummary>(`/workspaces/${workspaceId}/plan`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  importExpensesCsv: (workspaceId: string, body: ExpenseCsvImportRequest) =>
    apiFetch<{ imported: number }>(
      `/workspaces/${workspaceId}/expenses/import-csv`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
