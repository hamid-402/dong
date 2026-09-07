import type {
  CreateExpenseCategoryRequest,
  CreateExpenseDraftRequest,
  CreateRecurringRuleRequest,
  ExpenseCategorySummary,
  ExpenseSummary,
  ExpenseSplitLine,
  RecurringRuleSummary,
  ReviseRecurringRuleRequest,
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
  approveExpense: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(
      `/workspaces/${workspaceId}/expenses/${expenseId}/approve`,
      { method: "POST", body: "{}" },
    ),
  promoteExpenseCompany: (workspaceId: string, expenseId: string) =>
    apiFetch<ExpenseSummary>(
      `/workspaces/${workspaceId}/expenses/${expenseId}/promote-company`,
      { method: "POST", body: "{}" },
    ),
  listCategories: (workspaceId: string) =>
    apiFetch<ExpenseCategorySummary[]>(`/workspaces/${workspaceId}/categories`),
  createCategory: (workspaceId: string, body: CreateExpenseCategoryRequest) =>
    apiFetch<ExpenseCategorySummary>(`/workspaces/${workspaceId}/categories`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listRecurringRules: (workspaceId: string) =>
    apiFetch<RecurringRuleSummary[]>(`/workspaces/${workspaceId}/recurring-rules`),
  createRecurringRule: (workspaceId: string, body: CreateRecurringRuleRequest) =>
    apiFetch<RecurringRuleSummary>(
      `/workspaces/${workspaceId}/recurring-rules`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  reviseRecurringRule: (
    workspaceId: string,
    ruleId: string,
    body: ReviseRecurringRuleRequest,
  ) =>
    apiFetch<RecurringRuleSummary>(
      `/workspaces/${workspaceId}/recurring-rules/${ruleId}/revise`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  runRecurringDue: (workspaceId: string) =>
    apiFetch<{ createdExpenseIds: string[]; titles: string[] }>(
      `/workspaces/${workspaceId}/recurring-rules/run-due`,
      { method: "POST", body: "{}" },
    ),
};
