import type { CreateExpenseCategoryRequest, CreateExpenseDraftRequest, CreateExpenseTagRequest, CreateRecurringRuleRequest, ExpenseCategorySummary, ExpenseListQuery, ExpenseSplitLine, ExpenseSummary, ExpenseTagSummary, RebuildFundPartyJournalsResult, RecurringRuleSummary, ReviseRecurringRuleRequest, SetExpenseTagsRequest } from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const expensesApi = {
  listExpenses: (workspaceId: string, query?: ExpenseListQuery) =>
    apiFetch<ExpenseSummary[]>(
      `/workspaces/${workspaceId}/expenses${qs({
        visibility: query?.visibility,
        status: query?.status,
        from: query?.from,
        to: query?.to,
        catalogItemId: query?.catalogItemId,
        q: query?.q,
        paidByUserId: query?.paidByUserId,
        categoryId: query?.categoryId,
        tagId: query?.tagId,
      })}`,
    ),
  listExpenseTags: (workspaceId: string) =>
    apiFetch<ExpenseTagSummary[]>(
      `/workspaces/${workspaceId}/expense-tags`,
    ),
  createExpenseTag: (
    workspaceId: string,
    body: CreateExpenseTagRequest,
  ) =>
    postWithOfflineQueue<ExpenseTagSummary>({
      path: `/workspaces/${workspaceId}/expense-tags`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "برچسب",
    }),
  setExpenseTags: (
    workspaceId: string,
    expenseId: string,
    body: SetExpenseTagsRequest,
  ) =>
    apiFetch<{ tagIds: string[] }>(
      `/workspaces/${workspaceId}/expenses/${expenseId}/tags`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
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
    postWithOfflineQueue<ExpenseSummary>({
      path: `/workspaces/${workspaceId}/expenses`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.title?.trim() || "پیش‌نویس خرج",
    }),
  submitExpense: (workspaceId: string, expenseId: string) =>
    postWithOfflineQueue<ExpenseSummary>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/submit`,
      label: "ارسال خرج برای تأیید",
    }),
  postExpense: (workspaceId: string, expenseId: string) =>
    postWithOfflineQueue<ExpenseSummary>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/post`,
      label: "ثبت نهایی خرج",
    }),
  approveExpense: (workspaceId: string, expenseId: string) =>
    postWithOfflineQueue<ExpenseSummary>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/approve`,
      body: "{}",
      label: "تأیید خرج",
    }),
  promoteExpenseCompany: (workspaceId: string, expenseId: string) =>
    postWithOfflineQueue<ExpenseSummary>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/promote-company`,
      body: "{}",
      label: "ارتقای خرج شرکتی",
    }),
  reverseExpense: (
    workspaceId: string,
    expenseId: string,
    body?: { reason?: string; idempotencyKey?: string },
  ) =>
    postWithOfflineQueue<ExpenseSummary>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/reverse`,
      body: JSON.stringify(body ?? {}),
      idempotencyKey: body?.idempotencyKey,
      label: "برگشت خرج",
    }),
  restoreExpense: (
    workspaceId: string,
    expenseId: string,
    body: { idempotencyKey: string },
  ) =>
    postWithOfflineQueue<{ restored: ExpenseSummary; fromExpenseId: string }>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/restore`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "بازیابی خرج",
    }),
  purgeExpense: (workspaceId: string, expenseId: string) =>
    apiFetch<{ deleted: true }>(
      `/workspaces/${workspaceId}/expenses/${expenseId}`,
      { method: "DELETE" },
    ),
  reviseExpense: (
    workspaceId: string,
    expenseId: string,
    body: CreateExpenseDraftRequest & { reverseReason?: string },
  ) =>
    postWithOfflineQueue<{
      reversed: ExpenseSummary;
      created: ExpenseSummary;
    }>({
      path: `/workspaces/${workspaceId}/expenses/${expenseId}/revise`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "اصلاح خرج",
    }),
  listCategories: (workspaceId: string) =>
    apiFetch<ExpenseCategorySummary[]>(`/workspaces/${workspaceId}/categories`),
  createCategory: (workspaceId: string, body: CreateExpenseCategoryRequest) =>
    postWithOfflineQueue<ExpenseCategorySummary>({
      path: `/workspaces/${workspaceId}/categories`,
      body: JSON.stringify(body),
      label: body.name?.trim() || "دسته خرج",
    }),
  listRecurringRules: (workspaceId: string) =>
    apiFetch<RecurringRuleSummary[]>(`/workspaces/${workspaceId}/recurring-rules`),
  createRecurringRule: (workspaceId: string, body: CreateRecurringRuleRequest) =>
    postWithOfflineQueue<RecurringRuleSummary>({
      path: `/workspaces/${workspaceId}/recurring-rules`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.title?.trim() || "قانون تکرارشونده",
    }),
  reviseRecurringRule: (
    workspaceId: string,
    ruleId: string,
    body: ReviseRecurringRuleRequest,
  ) =>
    postWithOfflineQueue<RecurringRuleSummary>({
      path: `/workspaces/${workspaceId}/recurring-rules/${ruleId}/revise`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ویرایش قانون تکرارشونده",
    }),
  runRecurringDue: (workspaceId: string) =>
    apiFetch<{ createdExpenseIds: string[]; titles: string[] }>(
      `/workspaces/${workspaceId}/recurring-rules/run-due`,
      { method: "POST", body: "{}" },
    ),
  /**
   * Opt-in: rebuild posted expense journals under fund-as-settlement-party.
   * Requires ENABLE_FUND_AS_SETTLEMENT_PARTY and finance-manager role.
   */
  rebuildFundPartyJournals: (
    workspaceId: string,
    body?: { force?: boolean },
  ) =>
    apiFetch<RebuildFundPartyJournalsResult>(
      `/workspaces/${workspaceId}/expenses/rebuild-fund-party-journals`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      },
    ),
};

export { OfflineQueuedError } from "@/lib/offline-mutation-queue";
