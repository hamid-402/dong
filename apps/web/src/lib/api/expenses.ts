import type {
  CreateExpenseDraftRequest,
  ExpenseSummary,
  ExpenseSplitLine,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const expensesApi = {
  listExpenses: (workspaceId: string) =>
    apiFetch<ExpenseSummary[]>(`/workspaces/${workspaceId}/expenses`),
  previewExpenseSplit: (
    workspaceId: string,
    body: Pick<
      CreateExpenseDraftRequest,
      | "total"
      | "splitMethod"
      | "participantUserIds"
      | "splitLines"
      | "items"
      | "tip"
      | "tax"
      | "discount"
    >,
  ) =>
    apiFetch<{ splits: ExpenseSplitLine[] }>(
      `/workspaces/${workspaceId}/expenses/preview-split`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  createExpenseDraft: (workspaceId: string, body: CreateExpenseDraftRequest) =>
    apiFetch<ExpenseSummary>(
      `/workspaces/${workspaceId}/expenses`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      body.idempotencyKey,
    ),
  submitExpense: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(`/workspaces/${workspaceId}/expenses/${expenseId}/submit`, {
      method: "POST",
    }),
  postExpense: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(`/workspaces/${workspaceId}/expenses/${expenseId}/post`, {
      method: "POST",
    }),
  promoteExpenseCompany: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(
      `/workspaces/${workspaceId}/expenses/${expenseId}/promote-company`,
      { method: "POST", body: "{}" },
    ),
};
