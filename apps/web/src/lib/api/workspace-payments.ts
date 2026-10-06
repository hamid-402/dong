import type { CreateCreditPurchasePaymentRequest, CreateCreditPurchaseRequest, CreateOnBehalfPaymentRequest, CreatePaymentReceiptRequest, CreatePettyCashFundRequest, CreatePettyCashMovementRequest, CreditPurchaseStatus, CreditPurchaseSummary, GiftPettyCashRequest, GiftPettyCashResponse, OnBehalfPaymentStatus, OnBehalfPaymentSummary, PaymentReceiptStatus, PaymentReceiptSummary, PettyCashFundSummary, PettyCashHealthReport, PettyCashLedgerResponse, RejectOnBehalfPaymentRequest, RejectPaymentReceiptRequest, SettlePayRequest, SettlePayResponse, SpendPettyCashAsExpenseRequest, SpendPettyCashAsExpenseResponse, TopupPettyCashFromMembersRequest, TopupPettyCashFromMembersResponse } from "@dang/contracts";
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

export const workspacePaymentsApi = {
  listReceipts: (workspaceId: string, status?: PaymentReceiptStatus) =>
    apiFetch<PaymentReceiptSummary[]>(
      `/workspaces/${workspaceId}/payments/receipts${qs({ status })}`,
    ),

  createReceipt: (workspaceId: string, body: CreatePaymentReceiptRequest) =>
    postWithOfflineQueue<PaymentReceiptSummary>({
      path: `/workspaces/${workspaceId}/payments/receipts`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "رسید پرداخت",
    }),

  approveReceipt: (workspaceId: string, receiptId: string) =>
    postWithOfflineQueue<PaymentReceiptSummary>({
      path: `/workspaces/${workspaceId}/payments/receipts/${receiptId}/approve`,
      body: "{}",
      label: "تأیید رسید پرداخت",
    }),

  rejectReceipt: (
    workspaceId: string,
    receiptId: string,
    body: RejectPaymentReceiptRequest,
  ) =>
    postWithOfflineQueue<PaymentReceiptSummary>({
      path: `/workspaces/${workspaceId}/payments/receipts/${receiptId}/reject`,
      body: JSON.stringify(body),
      label: "رد رسید پرداخت",
    }),

  listPettyCash: (workspaceId: string) =>
    apiFetch<PettyCashFundSummary[]>(
      `/workspaces/${workspaceId}/payments/petty-cash`,
    ),

  getPettyCashLedger: (workspaceId: string, fundId: string) =>
    apiFetch<PettyCashLedgerResponse>(
      `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/ledger`,
    ),

  pettyCashHealth: (workspaceId: string) =>
    apiFetch<PettyCashHealthReport>(
      `/workspaces/${workspaceId}/payments/petty-cash/health`,
    ),

  createPettyCashFund: (workspaceId: string, body: CreatePettyCashFundRequest) =>
    postWithOfflineQueue<PettyCashFundSummary>({
      path: `/workspaces/${workspaceId}/payments/petty-cash`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: body.name?.trim() || "صندوق تنخواه",
    }),

  ensureDefaultPettyCashFund: (
    workspaceId: string,
    body?: { idempotencyKey?: string },
  ) =>
    postWithOfflineQueue<{
      created: boolean;
      funds: PettyCashFundSummary[];
      defaultFund: PettyCashFundSummary | null;
    }>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/ensure-default`,
      body: JSON.stringify(body ?? {}),
      idempotencyKey: body?.idempotencyKey,
      label: "ایجاد تنخواه اصلی",
    }),

  closePettyCashFund: (workspaceId: string, fundId: string) =>
    postWithOfflineQueue<PettyCashFundSummary>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/close`,
      body: "{}",
      label: "بستن صندوق تنخواه",
    }),

  reopenPettyCashFund: (workspaceId: string, fundId: string) =>
    postWithOfflineQueue<PettyCashFundSummary>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/reopen`,
      body: "{}",
      label: "بازگشایی صندوق تنخواه",
    }),

  createPettyCashMovement: (
    workspaceId: string,
    fundId: string,
    body: CreatePettyCashMovementRequest,
  ) =>
    postWithOfflineQueue<{
      movement: {
        id: string;
        fundId: string;
        kind: string;
        amountMinor: string;
        balanceMinor?: string;
      };
      balanceMinor: string;
    }>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/movements`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "حرکت تنخواه",
    }),

  topupPettyCashFromMembers: (
    workspaceId: string,
    fundId: string,
    body: TopupPettyCashFromMembersRequest,
  ) =>
    postWithOfflineQueue<TopupPettyCashFromMembersResponse>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/topup-from-members`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "شارژ تنخواه از سهم اعضا",
    }),

  giftPettyCash: (
    workspaceId: string,
    fundId: string,
    body: GiftPettyCashRequest,
  ) =>
    postWithOfflineQueue<GiftPettyCashResponse>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/gift`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "هدیه به صندوق تنخواه",
    }),

  settlePay: (workspaceId: string, body: SettlePayRequest) => {
    const path = `/workspaces/${workspaceId}/payments/settle-pay`;
    const payload = JSON.stringify(body);
    if (body.previewOnly) {
      return apiFetch<SettlePayResponse>(path, {
        method: "POST",
        body: payload,
      });
    }
    return postWithOfflineQueue<SettlePayResponse>({
      path,
      body: payload,
      idempotencyKey: body.idempotencyKey,
      label: "تسویه هوشمند",
    });
  },

  spendPettyCashAsExpense: (
    workspaceId: string,
    fundId: string,
    body: SpendPettyCashAsExpenseRequest,
  ) =>
    postWithOfflineQueue<SpendPettyCashAsExpenseResponse>({
      path: `/workspaces/${workspaceId}/payments/petty-cash/${fundId}/spend-as-expense`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "برداشت تنخواه با سهم",
    }),

  listCreditPurchases: (workspaceId: string, status?: CreditPurchaseStatus) =>
    apiFetch<CreditPurchaseSummary[]>(
      `/workspaces/${workspaceId}/payments/credit-purchases${qs({ status })}`,
    ),

  createCreditPurchase: (
    workspaceId: string,
    body: CreateCreditPurchaseRequest,
  ) =>
    postWithOfflineQueue<CreditPurchaseSummary>({
      path: `/workspaces/${workspaceId}/payments/credit-purchases`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "خرید نسیه",
    }),

  createCreditPurchasePayment: (
    workspaceId: string,
    purchaseId: string,
    body: CreateCreditPurchasePaymentRequest,
  ) =>
    postWithOfflineQueue<CreditPurchaseSummary>({
      path: `/workspaces/${workspaceId}/payments/credit-purchases/${purchaseId}/payments`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "پرداخت خرید نسیه",
    }),

  listOnBehalf: (workspaceId: string, status?: OnBehalfPaymentStatus) =>
    apiFetch<OnBehalfPaymentSummary[]>(
      `/workspaces/${workspaceId}/payments/on-behalf${qs({ status })}`,
    ),

  createOnBehalf: (workspaceId: string, body: CreateOnBehalfPaymentRequest) =>
    postWithOfflineQueue<OnBehalfPaymentSummary>({
      path: `/workspaces/${workspaceId}/payments/on-behalf`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "پرداخت به‌جای دیگری",
    }),

  approveOnBehalf: (workspaceId: string, onBehalfId: string) =>
    postWithOfflineQueue<OnBehalfPaymentSummary>({
      path: `/workspaces/${workspaceId}/payments/on-behalf/${onBehalfId}/approve`,
      body: "{}",
      label: "تأیید پرداخت به‌جای",
    }),

  rejectOnBehalf: (
    workspaceId: string,
    onBehalfId: string,
    body: RejectOnBehalfPaymentRequest,
  ) =>
    postWithOfflineQueue<OnBehalfPaymentSummary>({
      path: `/workspaces/${workspaceId}/payments/on-behalf/${onBehalfId}/reject`,
      body: JSON.stringify(body),
      label: "رد پرداخت به‌جای",
    }),
};
