import type {
  ApprovalDecision,
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
  VendorSummary,
} from "@dang/contracts";

export type ProcurementStore = {
  readonly persistence: "memory" | "postgres";
  createNeed(actorUserId: string, input: CreateNeedRequest): Promise<NeedSummary>;
  listNeeds(workspaceId: string): Promise<NeedSummary[]>;
  createPurchaseRequest(
    actorUserId: string,
    input: CreatePurchaseRequestRequest,
  ): Promise<PurchaseRequestSummary>;
  submitPurchaseRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<PurchaseRequestSummary>;
  decidePurchaseRequest(
    workspaceId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<PurchaseRequestSummary>;
  listPurchaseRequests(workspaceId: string): Promise<PurchaseRequestSummary[]>;
  getPurchaseRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<PurchaseRequestSummary | undefined>;
  createBudget(input: CreateBudgetRequest): Promise<BudgetSummary>;
  listBudgets(workspaceId: string): Promise<BudgetSummary[]>;
  /** Additive: debit open budget(s) when a company expense is posted. */
  applyCompanyExpenseSpend(
    workspaceId: string,
    amountMinor: string,
    budgetId?: string,
  ): Promise<BudgetSummary | null>;
  createVendor(input: CreateVendorRequest): Promise<VendorSummary>;
  listVendors(workspaceId: string): Promise<VendorSummary[]>;
  getVendor(workspaceId: string, vendorId: string): Promise<VendorSummary | undefined>;
  createPurchaseOrder(
    actorUserId: string,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderSummary>;
  listPurchaseOrders(workspaceId: string): Promise<PurchaseOrderSummary[]>;
  getPurchaseOrder(
    workspaceId: string,
    orderId: string,
  ): Promise<PurchaseOrderSummary | undefined>;
  recordDelivery(
    actorUserId: string,
    input: RecordDeliveryRequest,
  ): Promise<DeliverySummary>;
  listDeliveries(workspaceId: string): Promise<DeliverySummary[]>;
  getDelivery(
    workspaceId: string,
    deliveryId: string,
  ): Promise<DeliverySummary | undefined>;
};

export const PROCUREMENT_STORE = Symbol("PROCUREMENT_STORE");
