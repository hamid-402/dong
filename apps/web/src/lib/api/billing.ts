import type {
  CloseExpensePeriodRequest,
  CreateExpensePeriodRequest,
  CreatePaymentLinkRequest,
  CreatePeriodLockRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  LocalPspIntentSummary,
  LocalPspVerifyResponse,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  PaymentLinkSummary,
  PeriodLockSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Expense period, invoice, period-lock and payment-link endpoints — domain slice (dong-50 #30). */
export const billingApi = {
  listPeriods: (workspaceId: string) =>
    apiFetch<ExpensePeriodSummary[]>(`/workspaces/${workspaceId}/periods`),
  createPeriod: (workspaceId: string, body: CreateExpensePeriodRequest, idempotencyKey?: string) =>
    postWithOfflineQueue<ExpensePeriodSummary>({
      path: `/workspaces/${workspaceId}/periods`,
      body: JSON.stringify(body),
      idempotencyKey: idempotencyKey ?? body.idempotencyKey,
      label: body.title?.trim() || "دوره مالی",
    }),
  generatePeriodInvoices: (
    workspaceId: string,
    periodId: string,
    body: GeneratePeriodInvoicesRequest = {},
  ) =>
    postWithOfflineQueue<MemberInvoiceSummary[]>({
      path: `/workspaces/${workspaceId}/periods/${periodId}/invoices/generate`,
      body: JSON.stringify(body),
      label: "صدور صورتحساب‌های دوره",
    }),
  listPeriodInvoices: (workspaceId: string, periodId: string) =>
    apiFetch<MemberInvoiceSummary[]>(
      `/workspaces/${workspaceId}/periods/${periodId}/invoices`,
    ),
  /** Correction notices raised against invoices that were already issued. */
  listInvoiceAdjustments: (workspaceId: string, periodId: string) =>
    apiFetch<MemberInvoiceAdjustmentSummary[]>(
      `/workspaces/${workspaceId}/periods/${periodId}/invoices/adjustments`,
    ),
  approveInvoice: (workspaceId: string, invoiceId: string) =>
    postWithOfflineQueue<MemberInvoiceSummary>({
      path: `/workspaces/${workspaceId}/invoices/${invoiceId}/approve`,
      body: "{}",
      label: "تأیید صورتحساب",
    }),
  disputeInvoice: (workspaceId: string, invoiceId: string, note?: string) =>
    postWithOfflineQueue<MemberInvoiceSummary>({
      path: `/workspaces/${workspaceId}/invoices/${invoiceId}/dispute`,
      body: JSON.stringify({ note }),
      label: "اختلاف صورتحساب",
    }),
  resolveInvoiceDispute: (
    workspaceId: string,
    invoiceId: string,
    outcome: "accepted" | "rejected",
    note?: string,
  ) =>
    postWithOfflineQueue<MemberInvoiceSummary>({
      path: `/workspaces/${workspaceId}/invoices/${invoiceId}/dispute/resolve`,
      body: JSON.stringify(note?.trim() ? { outcome, note: note.trim() } : { outcome }),
      label: "رسیدگی به اعتراض صورتحساب",
    }),
  issueInvoice: (workspaceId: string, invoiceId: string) =>
    postWithOfflineQueue<MemberInvoiceSummary>({
      path: `/workspaces/${workspaceId}/invoices/${invoiceId}/issue`,
      body: "{}",
      label: "صدور صورتحساب",
    }),
  markInvoicePaid: (workspaceId: string, invoiceId: string) =>
    postWithOfflineQueue<MemberInvoiceSummary>({
      path: `/workspaces/${workspaceId}/invoices/${invoiceId}/paid`,
      body: "{}",
      label: "پرداخت‌شده صورتحساب",
    }),
  closePeriod: (
    workspaceId: string,
    periodId: string,
    body: CloseExpensePeriodRequest = { requireAllPaid: true },
  ) =>
    postWithOfflineQueue<ExpensePeriodSummary>({
      path: `/workspaces/${workspaceId}/periods/${periodId}/close`,
      body: JSON.stringify(body),
      label: "بستن دوره",
    }),
  cancelPeriod: (workspaceId: string, periodId: string) =>
    postWithOfflineQueue<ExpensePeriodSummary>({
      path: `/workspaces/${workspaceId}/periods/${periodId}/cancel`,
      body: "{}",
      label: "لغو دوره",
    }),
  createPeriodLock: (workspaceId: string, body: CreatePeriodLockRequest) =>
    postWithOfflineQueue<PeriodLockSummary>({
      path: `/workspaces/${workspaceId}/period-locks`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "قفل دوره",
    }),
  listPeriodLocks: (workspaceId: string) =>
    apiFetch<PeriodLockSummary[]>(`/workspaces/${workspaceId}/period-locks`),
  createPaymentLink: (workspaceId: string, body: CreatePaymentLinkRequest) =>
    postWithOfflineQueue<PaymentLinkSummary>({
      path: `/workspaces/${workspaceId}/payment-links`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "لینک پرداخت",
    }),
  listPaymentLinks: (workspaceId: string) =>
    apiFetch<PaymentLinkSummary[]>(`/workspaces/${workspaceId}/payment-links`),
  getLocalPspIntent: (intentId: string) =>
    apiFetch<LocalPspIntentSummary>(`/payments/local/intents/${encodeURIComponent(intentId)}`),
  verifyLocalPsp: (intentId: string, body: { amountMinor?: string } = {}) =>
    apiFetch<LocalPspVerifyResponse>(
      `/payments/local/intents/${encodeURIComponent(intentId)}/verify`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
