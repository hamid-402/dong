import type {
  BudgetSummary,
  CreateBudgetRequest,
  CreateNeedRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseRequestRequest,
  CreateVendorRequest,
  DeliverySummary,
  NeedSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  RecordDeliveryRequest,
  SubmitApprovalRequest,
  VendorSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

/** Need, purchase-request, budget, vendor, purchase-order and delivery endpoints — domain slice (dong-50 #30). */
export const procurementApi = {
  createNeed: (workspaceId: string, body: CreateNeedRequest) =>
    apiFetch<NeedSummary>(
      `/workspaces/${workspaceId}/needs`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listNeeds: (workspaceId: string) =>
    apiFetch<NeedSummary[]>(`/workspaces/${workspaceId}/needs`),
  createPurchaseRequest: (workspaceId: string, body: CreatePurchaseRequestRequest) =>
    apiFetch<PurchaseRequestSummary>(
      `/workspaces/${workspaceId}/purchase-requests`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  submitPurchaseRequest: (workspaceId: string, requestId: string) =>
    apiFetch<PurchaseRequestSummary>(
      `/workspaces/${workspaceId}/purchase-requests/${requestId}/submit`,
      { method: "POST" },
    ),
  listPurchaseRequests: (workspaceId: string) =>
    apiFetch<PurchaseRequestSummary[]>(`/workspaces/${workspaceId}/purchase-requests`),
  approvePurchaseRequest: (workspaceId: string, body: SubmitApprovalRequest) =>
    apiFetch<PurchaseRequestSummary>(`/workspaces/${workspaceId}/approvals`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createBudget: (workspaceId: string, body: CreateBudgetRequest) =>
    apiFetch<BudgetSummary>(
      `/workspaces/${workspaceId}/budgets`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listBudgets: (workspaceId: string) =>
    apiFetch<BudgetSummary[]>(`/workspaces/${workspaceId}/budgets`),
  createVendor: (workspaceId: string, body: CreateVendorRequest) =>
    apiFetch<VendorSummary>(
      `/workspaces/${workspaceId}/vendors`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listVendors: (workspaceId: string) =>
    apiFetch<VendorSummary[]>(`/workspaces/${workspaceId}/vendors`),
  createPurchaseOrder: (workspaceId: string, body: CreatePurchaseOrderRequest) =>
    apiFetch<PurchaseOrderSummary>(
      `/workspaces/${workspaceId}/purchase-orders`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listPurchaseOrders: (workspaceId: string) =>
    apiFetch<PurchaseOrderSummary[]>(`/workspaces/${workspaceId}/purchase-orders`),
  recordDelivery: (workspaceId: string, body: RecordDeliveryRequest) =>
    apiFetch<DeliverySummary>(
      `/workspaces/${workspaceId}/deliveries`,
      { method: "POST", body: JSON.stringify(body) },
      body.idempotencyKey,
    ),
  listDeliveries: (workspaceId: string) =>
    apiFetch<DeliverySummary[]>(`/workspaces/${workspaceId}/deliveries`),
};
