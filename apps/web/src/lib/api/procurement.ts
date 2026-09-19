import type {
  BudgetSummary,
  CreateBudgetRequest,
  CreateNeedRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseRequestRequest,
  CreateVendorRequest,
  DeliverySummary,
  LinkPurchaseOrderExpenseRequest,
  NeedSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  RecordDeliveryRequest,
  SubmitApprovalRequest,
  VendorSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";
import { postWithOfflineQueue } from "./offline-post";

/** Need, purchase-request, budget, vendor, purchase-order and delivery endpoints — domain slice (dong-50 #30). */
export const procurementApi = {
  createNeed: (workspaceId: string, body: CreateNeedRequest) =>
    postWithOfflineQueue<NeedSummary>({
      path: `/workspaces/${workspaceId}/needs`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد نیاز",
    }),
  listNeeds: (workspaceId: string) =>
    apiFetch<NeedSummary[]>(`/workspaces/${workspaceId}/needs`),
  fulfillNeed: (workspaceId: string, needId: string) =>
    postWithOfflineQueue<NeedSummary>({
      path: `/workspaces/${workspaceId}/needs/${needId}/fulfill`,
      label: "برآوردن نیاز",
    }),
  cancelNeed: (workspaceId: string, needId: string) =>
    postWithOfflineQueue<NeedSummary>({
      path: `/workspaces/${workspaceId}/needs/${needId}/cancel`,
      label: "لغو نیاز",
    }),
  createPurchaseRequest: (workspaceId: string, body: CreatePurchaseRequestRequest) =>
    postWithOfflineQueue<PurchaseRequestSummary>({
      path: `/workspaces/${workspaceId}/purchase-requests`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد درخواست خرید",
    }),
  submitPurchaseRequest: (workspaceId: string, requestId: string) =>
    postWithOfflineQueue<PurchaseRequestSummary>({
      path: `/workspaces/${workspaceId}/purchase-requests/${requestId}/submit`,
      label: "ارسال درخواست خرید",
    }),
  listPurchaseRequests: (workspaceId: string) =>
    apiFetch<PurchaseRequestSummary[]>(`/workspaces/${workspaceId}/purchase-requests`),
  approvePurchaseRequest: (workspaceId: string, body: SubmitApprovalRequest) =>
    postWithOfflineQueue<PurchaseRequestSummary>({
      path: `/workspaces/${workspaceId}/approvals`,
      body: JSON.stringify(body),
      label: "تأیید درخواست خرید",
    }),
  createBudget: (workspaceId: string, body: CreateBudgetRequest) =>
    postWithOfflineQueue<BudgetSummary>({
      path: `/workspaces/${workspaceId}/budgets`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد بودجه",
    }),
  listBudgets: (workspaceId: string) =>
    apiFetch<BudgetSummary[]>(`/workspaces/${workspaceId}/budgets`),
  createVendor: (workspaceId: string, body: CreateVendorRequest) =>
    postWithOfflineQueue<VendorSummary>({
      path: `/workspaces/${workspaceId}/vendors`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد تأمین‌کننده",
    }),
  listVendors: (workspaceId: string) =>
    apiFetch<VendorSummary[]>(`/workspaces/${workspaceId}/vendors`),
  createPurchaseOrder: (workspaceId: string, body: CreatePurchaseOrderRequest) =>
    postWithOfflineQueue<PurchaseOrderSummary>({
      path: `/workspaces/${workspaceId}/purchase-orders`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ایجاد سفارش خرید",
    }),
  listPurchaseOrders: (workspaceId: string) =>
    apiFetch<PurchaseOrderSummary[]>(`/workspaces/${workspaceId}/purchase-orders`),
  cancelPurchaseOrder: (workspaceId: string, orderId: string) =>
    postWithOfflineQueue<PurchaseOrderSummary>({
      path: `/workspaces/${workspaceId}/purchase-orders/${orderId}/cancel`,
      label: "لغو سفارش خرید",
    }),
  linkPurchaseOrderExpense: (
    workspaceId: string,
    orderId: string,
    body: LinkPurchaseOrderExpenseRequest,
  ) =>
    postWithOfflineQueue<PurchaseOrderSummary>({
      path: `/workspaces/${workspaceId}/purchase-orders/${orderId}/link-expense`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "اتصال سفارش به هزینه",
    }),
  recordDelivery: (workspaceId: string, body: RecordDeliveryRequest) =>
    postWithOfflineQueue<DeliverySummary>({
      path: `/workspaces/${workspaceId}/deliveries`,
      body: JSON.stringify(body),
      idempotencyKey: body.idempotencyKey,
      label: "ثبت تحویل",
    }),
  listDeliveries: (workspaceId: string) =>
    apiFetch<DeliverySummary[]>(`/workspaces/${workspaceId}/deliveries`),
};
