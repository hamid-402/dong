import type {
  CloseExpensePeriodRequest,
  CreateExpensePeriodRequest,
  CreatePaymentLinkRequest,
  CreatePeriodLockRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  MemberInvoiceSummary,
  PaymentLinkSummary,
  PeriodLockSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Expense period, invoice, period-lock and payment-link endpoints — domain slice (dong-50 #30). */
export const billingApi = {
  listPeriods: (workspaceId: string) =>
    apiFetch<ExpensePeriodSummary[]>(`/workspaces/${workspaceId}/periods`),
  createPeriod: (workspaceId: string, body: CreateExpensePeriodRequest, idempotencyKey?: string) =>
    apiFetch<ExpensePeriodSummary>(
      `/workspaces/${workspaceId}/periods`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      idempotencyKey ?? body.idempotencyKey,
    ),
  generatePeriodInvoices: (
    workspaceId: string,
    periodId: string,
    body: GeneratePeriodInvoicesRequest = {},
  ) =>
    apiFetch<MemberInvoiceSummary[]>(
      `/workspaces/${workspaceId}/periods/${periodId}/invoices/generate`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  listPeriodInvoices: (workspaceId: string, periodId: string) =>
    apiFetch<MemberInvoiceSummary[]>(
      `/workspaces/${workspaceId}/periods/${periodId}/invoices`,
    ),
  approveInvoice: (workspaceId: string, invoiceId: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/approve`,
      { method: "POST", body: "{}" },
    ),
  disputeInvoice: (workspaceId: string, invoiceId: string, note?: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/dispute`,
      {
        method: "POST",
        body: JSON.stringify({ note }),
      },
    ),
  issueInvoice: (workspaceId: string, invoiceId: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/issue`,
      { method: "POST", body: "{}" },
    ),
  markInvoicePaid: (workspaceId: string, invoiceId: string) =>
    apiFetch<MemberInvoiceSummary>(
      `/workspaces/${workspaceId}/invoices/${invoiceId}/paid`,
      { method: "POST", body: "{}" },
    ),
  closePeriod: (
    workspaceId: string,
    periodId: string,
    body: CloseExpensePeriodRequest = { requireAllPaid: true },
  ) =>
    apiFetch<ExpensePeriodSummary>(
      `/workspaces/${workspaceId}/periods/${periodId}/close`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  cancelPeriod: (workspaceId: string, periodId: string) =>
    apiFetch<ExpensePeriodSummary>(
      `/workspaces/${workspaceId}/periods/${periodId}/cancel`,
      { method: "POST", body: "{}" },
    ),
  createPeriodLock: (workspaceId: string, body: CreatePeriodLockRequest) =>
    apiFetch<PeriodLockSummary>(
      `/workspaces/${workspaceId}/period-locks`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPeriodLocks: (workspaceId: string) =>
    apiFetch<PeriodLockSummary[]>(`/workspaces/${workspaceId}/period-locks`),
  createPaymentLink: (workspaceId: string, body: CreatePaymentLinkRequest) =>
    apiFetch<PaymentLinkSummary>(
      `/workspaces/${workspaceId}/payment-links`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPaymentLinks: (workspaceId: string) =>
    apiFetch<PaymentLinkSummary[]>(`/workspaces/${workspaceId}/payment-links`),
};
