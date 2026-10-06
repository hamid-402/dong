import type { CategoryBudgetUsage, CreateCategoryBudgetRequest, CreateReimbursementRequest, CreateSubscriptionInvoiceRequest, EmailDigestFrequency, ExpenseCsvImportRequest, NotificationPreferenceSummary, PaySubscriptionInvoiceRequest, PaymentLinkSummary, ReimbursementSummary, SaasUsageSnapshot, SubscriptionInvoiceSummary, UiPreferenceSummary, UpdateUiPreferenceRequest, UpdateWorkspaceExpensePolicyRequest, WorkspaceExpensePolicySummary, WorkspacePlanName, WorkspacePlanSummary } from "@dang/contracts";
import { invalidateWorkspaceAnalyticsCache } from "./charts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

export const waveFApi = {
  listReimbursements: (workspaceId: string) =>
    apiFetch<ReimbursementSummary[]>(`/workspaces/${workspaceId}/reimbursements`),
  createReimbursement: (workspaceId: string, body: CreateReimbursementRequest) =>
    postWithOfflineQueue<ReimbursementSummary>({
      path: `/workspaces/${workspaceId}/reimbursements`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.title?.trim() || "درخواست بازپرداخت",
    }),
  submitReimbursement: (workspaceId: string, id: string) =>
    postWithOfflineQueue<ReimbursementSummary>({
      path: `/workspaces/${workspaceId}/reimbursements/${id}/submit`,
      body: "{}",
      label: "ارسال بازپرداخت",
    }),
  approveReimbursement: (workspaceId: string, id: string, note?: string) =>
    postWithOfflineQueue<ReimbursementSummary>({
      path: `/workspaces/${workspaceId}/reimbursements/${id}/approve`,
      body: JSON.stringify({ note }),
      label: "تأیید بازپرداخت",
    }),
  rejectReimbursement: (workspaceId: string, id: string, note?: string) =>
    postWithOfflineQueue<ReimbursementSummary>({
      path: `/workspaces/${workspaceId}/reimbursements/${id}/reject`,
      body: JSON.stringify({ note }),
      label: "رد بازپرداخت",
    }),
  markReimbursementPaid: (workspaceId: string, id: string) =>
    postWithOfflineQueue<ReimbursementSummary>({
      path: `/workspaces/${workspaceId}/reimbursements/${id}/mark-paid`,
      body: "{}",
      label: "پرداخت بازپرداخت",
    }),
  cancelReimbursement: (workspaceId: string, id: string) =>
    postWithOfflineQueue<ReimbursementSummary>({
      path: `/workspaces/${workspaceId}/reimbursements/${id}/cancel`,
      body: "{}",
      label: "لغو بازپرداخت",
    }),
  listCategoryBudgetUsage: (workspaceId: string) =>
    apiFetch<CategoryBudgetUsage[]>(
      `/workspaces/${workspaceId}/category-budgets/usage`,
    ),
  createCategoryBudget: (workspaceId: string, body: CreateCategoryBudgetRequest) =>
    postWithOfflineQueue<CategoryBudgetUsage>({
      path: `/workspaces/${workspaceId}/category-budgets`,
      body: JSON.stringify(body),
      label: "بودجه دسته",
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
  putNotificationPrefs: (body: {
    emailDigest: EmailDigestFrequency;
    expensePosted?: boolean;
    settlementClaimed?: boolean;
    inviteAccepted?: boolean;
    securityAlert?: boolean;
  }) =>
    apiFetch<NotificationPreferenceSummary>("/me/notification-prefs", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getUiPrefs: () => apiFetch<UiPreferenceSummary>("/me/ui-prefs"),
  putUiPrefs: (body: UpdateUiPreferenceRequest) =>
    apiFetch<UiPreferenceSummary>("/me/ui-prefs", {
      method: "PUT",
      body: JSON.stringify(body),
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
    }).then((plan) => {
      invalidateWorkspaceAnalyticsCache(workspaceId);
      return plan;
    }),
  saasUsage: (workspaceId: string) =>
    apiFetch<SaasUsageSnapshot>(
      `/workspaces/${workspaceId}/saas/usage`,
    ),
  listSaasInvoices: (workspaceId: string) =>
    apiFetch<SubscriptionInvoiceSummary[]>(
      `/workspaces/${workspaceId}/saas/invoices`,
    ),
  createSaasInvoice: (
    workspaceId: string,
    body: CreateSubscriptionInvoiceRequest,
  ) =>
    postWithOfflineQueue<SubscriptionInvoiceSummary>({
      path: `/workspaces/${workspaceId}/saas/invoices`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "فاکتور اشتراک",
    }),
  paySaasInvoice: (
    workspaceId: string,
    invoiceId: string,
    body: PaySubscriptionInvoiceRequest,
  ) =>
    postWithOfflineQueue<{
      invoice: SubscriptionInvoiceSummary;
      paymentLink: PaymentLinkSummary;
    }>({
      path: `/workspaces/${workspaceId}/saas/invoices/${invoiceId}/pay`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "پرداخت فاکتور اشتراک",
    }),
  importExpensesCsv: (workspaceId: string, body: ExpenseCsvImportRequest) =>
    postWithOfflineQueue<{ imported: number }>({
      path: `/workspaces/${workspaceId}/expenses/import-csv`,
      body: JSON.stringify(body),
      label: "ورود CSV خرج",
    }),
};

