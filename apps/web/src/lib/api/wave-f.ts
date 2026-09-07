import type {
  CategoryBudgetUsage,
  CreateReimbursementRequest,
  ExpenseCsvImportRequest,
  ReimbursementSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const waveFApi = {
  listReimbursements: (workspaceId: string) =>
    apiFetch<ReimbursementSummary[]>(`/workspaces/${workspaceId}/reimbursements`),
  createReimbursement: (workspaceId: string, body: CreateReimbursementRequest) =>
    apiFetch<ReimbursementSummary>(`/workspaces/${workspaceId}/reimbursements`, {
      method: "POST", body: JSON.stringify(body),
    }),
  listCategoryBudgetUsage: (workspaceId: string) =>
    apiFetch<CategoryBudgetUsage[]>(`/workspaces/${workspaceId}/category-budgets/usage`),
  importExpensesCsv: (workspaceId: string, body: ExpenseCsvImportRequest) =>
    apiFetch<{ imported: number }>(`/workspaces/${workspaceId}/expenses/import-csv`, {
      method: "POST", body: JSON.stringify(body),
    }),
};
