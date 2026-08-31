import type { Money } from "./money.js";

export type NeedStatus = "open" | "fulfilled" | "cancelled";

export type CreateNeedRequest = {
  workspaceId: string;
  title: string;
  description?: string;
  estimatedAmount?: Money;
  idempotencyKey: string;
};

export type NeedSummary = {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  estimatedAmount?: Money;
  status: NeedStatus;
  createdByUserId: string;
  createdAt: string;
};

export type PurchaseRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "ordered"
  | "cancelled";

export type CreatePurchaseRequestRequest = {
  workspaceId: string;
  needId?: string;
  title: string;
  amount: Money;
  vendorName?: string;
  idempotencyKey: string;
};

export type PurchaseRequestSummary = {
  id: string;
  workspaceId: string;
  needId?: string;
  title: string;
  amount: Money;
  vendorName?: string;
  status: PurchaseRequestStatus;
  createdByUserId: string;
  createdAt: string;
};

export type BudgetPeriodStatus = "open" | "closed";

export type CreateBudgetRequest = {
  workspaceId: string;
  name: string;
  /** IRR minor ceiling. */
  ceiling: Money;
  periodStart: string;
  periodEnd: string;
  idempotencyKey: string;
};

export type BudgetSummary = {
  id: string;
  workspaceId: string;
  name: string;
  ceiling: Money;
  committedMinor: string;
  spentMinor: string;
  periodStart: string;
  periodEnd: string;
  status: BudgetPeriodStatus;
  createdAt: string;
};

export type ApprovalDecision = "approved" | "rejected";

export type SubmitApprovalRequest = {
  workspaceId: string;
  purchaseRequestId: string;
  decision: ApprovalDecision;
  note?: string;
};

export type VendorSummary = {
  id: string;
  workspaceId: string;
  name: string;
  contactPhone?: string;
  contactEmail?: string;
  createdAt: string;
};

export type CreateVendorRequest = {
  workspaceId: string;
  name: string;
  contactPhone?: string;
  contactEmail?: string;
  idempotencyKey: string;
};

export type PurchaseOrderStatus = "open" | "partially_delivered" | "delivered" | "cancelled";

export type PurchaseOrderSummary = {
  id: string;
  workspaceId: string;
  purchaseRequestId: string;
  vendorId: string;
  vendorName: string;
  title: string;
  amount: Money;
  status: PurchaseOrderStatus;
  createdByUserId: string;
  createdAt: string;
};

export type CreatePurchaseOrderRequest = {
  workspaceId: string;
  purchaseRequestId: string;
  vendorId: string;
  idempotencyKey: string;
};

export type DeliveryStatus = "complete" | "partial" | "discrepancy";

export type DeliverySummary = {
  id: string;
  workspaceId: string;
  purchaseOrderId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  status: DeliveryStatus;
  discrepancyNote?: string;
  recordedByUserId: string;
  recordedAt: string;
};

export type RecordDeliveryRequest = {
  workspaceId: string;
  purchaseOrderId: string;
  expectedQuantity: number;
  receivedQuantity: number;
  discrepancyNote?: string;
  idempotencyKey: string;
};

export const procurementVerticalSliceSteps = [
  "create_need",
  "create_purchase_request",
  "approve_request",
  "create_purchase_order",
  "record_delivery",
  "convert_to_asset",
] as const;

export type ProcurementVerticalSliceStep = (typeof procurementVerticalSliceSteps)[number];
