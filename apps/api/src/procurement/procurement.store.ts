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
import type { ProcurementStore } from "./procurement.types.js";

type StoredNeed = NeedSummary & { idempotencyKey: string };
type StoredPr = PurchaseRequestSummary & { idempotencyKey: string };
type StoredBudget = BudgetSummary & { idempotencyKey: string };
type StoredVendor = VendorSummary & { idempotencyKey: string };
type StoredPo = PurchaseOrderSummary & { idempotencyKey: string };
type StoredDelivery = DeliverySummary & { idempotencyKey: string };

function stripNeed(row: StoredNeed): NeedSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    description: row.description,
    estimatedAmount: row.estimatedAmount,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

function stripPr(row: StoredPr): PurchaseRequestSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    needId: row.needId,
    title: row.title,
    amount: row.amount,
    vendorName: row.vendorName,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

function stripBudget(row: StoredBudget): BudgetSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    ceiling: row.ceiling,
    committedMinor: row.committedMinor,
    spentMinor: row.spentMinor,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function stripVendor(row: StoredVendor): VendorSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt,
  };
}

function stripPo(row: StoredPo): PurchaseOrderSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purchaseRequestId: row.purchaseRequestId,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    title: row.title,
    amount: row.amount,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

function stripDelivery(row: StoredDelivery): DeliverySummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purchaseOrderId: row.purchaseOrderId,
    expectedQuantity: row.expectedQuantity,
    receivedQuantity: row.receivedQuantity,
    status: row.status,
    discrepancyNote: row.discrepancyNote,
    recordedByUserId: row.recordedByUserId,
    recordedAt: row.recordedAt,
  };
}

function deliveryStatus(
  expected: number,
  received: number,
  note?: string,
): DeliverySummary["status"] {
  if (received === expected) return "complete";
  if (note?.trim()) return "discrepancy";
  return "partial";
}

export class MemoryProcurementStore implements ProcurementStore {
  readonly persistence = "memory" as const;
  private readonly needs = new Map<string, StoredNeed>();
  private readonly requests = new Map<string, StoredPr>();
  private readonly budgets = new Map<string, StoredBudget>();
  private readonly vendors = new Map<string, StoredVendor>();
  private readonly orders = new Map<string, StoredPo>();
  private readonly deliveries = new Map<string, StoredDelivery>();

  createNeed(actorUserId: string, input: CreateNeedRequest): Promise<NeedSummary> {
    const id = crypto.randomUUID();
    const need: StoredNeed = {
      id,
      workspaceId: input.workspaceId,
      title: input.title.trim(),
      description: input.description?.trim(),
      estimatedAmount: input.estimatedAmount,
      status: "open",
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.needs.set(id, need);
    return Promise.resolve(stripNeed(need));
  }

  listNeeds(workspaceId: string): Promise<NeedSummary[]> {
    return Promise.resolve(
      [...this.needs.values()]
        .filter((n) => n.workspaceId === workspaceId)
        .map(stripNeed),
    );
  }

  createPurchaseRequest(
    actorUserId: string,
    input: CreatePurchaseRequestRequest,
  ): Promise<PurchaseRequestSummary> {
    const id = crypto.randomUUID();
    const pr: StoredPr = {
      id,
      workspaceId: input.workspaceId,
      needId: input.needId,
      title: input.title.trim(),
      amount: input.amount,
      vendorName: input.vendorName?.trim(),
      status: "draft",
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.requests.set(id, pr);
    return Promise.resolve(stripPr(pr));
  }

  submitPurchaseRequest(workspaceId: string, requestId: string): Promise<PurchaseRequestSummary> {
    const existing = this.requests.get(requestId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("PR_NOT_FOUND"));
    }
    if (existing.status !== "draft") {
      return Promise.reject(new Error("PR_STATUS"));
    }
    const updated: StoredPr = { ...existing, status: "submitted" };
    this.requests.set(requestId, updated);
    return Promise.resolve(stripPr(updated));
  }

  decidePurchaseRequest(
    workspaceId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<PurchaseRequestSummary> {
    const existing = this.requests.get(requestId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("PR_NOT_FOUND"));
    }
    if (existing.status !== "submitted") {
      return Promise.reject(new Error("PR_STATUS"));
    }
    const updated: StoredPr = {
      ...existing,
      status: decision === "approved" ? "approved" : "rejected",
    };
    this.requests.set(requestId, updated);
    return Promise.resolve(stripPr(updated));
  }

  listPurchaseRequests(workspaceId: string): Promise<PurchaseRequestSummary[]> {
    return Promise.resolve(
      [...this.requests.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .map(stripPr),
    );
  }

  getPurchaseRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<PurchaseRequestSummary | undefined> {
    const row = this.requests.get(requestId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(stripPr(row));
  }

  /** Used by Postgres hybrid store to unlock PO creation against a DB-backed PR. */
  seedPurchaseRequest(request: PurchaseRequestSummary): void {
    this.requests.set(request.id, {
      ...request,
      idempotencyKey: `seed-${request.id}`,
    });
  }

  createBudget(input: CreateBudgetRequest): Promise<BudgetSummary> {
    const id = crypto.randomUUID();
    const b: StoredBudget = {
      id,
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      ceiling: input.ceiling,
      committedMinor: "0",
      spentMinor: "0",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "open",
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.budgets.set(id, b);
    return Promise.resolve(stripBudget(b));
  }

  listBudgets(workspaceId: string): Promise<BudgetSummary[]> {
    return Promise.resolve(
      [...this.budgets.values()]
        .filter((b) => b.workspaceId === workspaceId)
        .map(stripBudget),
    );
  }

  createVendor(input: CreateVendorRequest): Promise<VendorSummary> {
    const id = crypto.randomUUID();
    const vendor: StoredVendor = {
      id,
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      contactPhone: input.contactPhone?.trim(),
      contactEmail: input.contactEmail?.trim(),
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.vendors.set(id, vendor);
    return Promise.resolve(stripVendor(vendor));
  }

  listVendors(workspaceId: string): Promise<VendorSummary[]> {
    return Promise.resolve(
      [...this.vendors.values()]
        .filter((v) => v.workspaceId === workspaceId)
        .map(stripVendor),
    );
  }

  getVendor(workspaceId: string, vendorId: string): Promise<VendorSummary | undefined> {
    const row = this.vendors.get(vendorId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(stripVendor(row));
  }

  createPurchaseOrder(
    actorUserId: string,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderSummary> {
    const pr = this.requests.get(input.purchaseRequestId);
    if (!pr || pr.workspaceId !== input.workspaceId) {
      return Promise.reject(new Error("PR_NOT_FOUND"));
    }
    if (pr.status !== "approved") {
      return Promise.reject(new Error("PR_NOT_APPROVED"));
    }
    const vendor = this.vendors.get(input.vendorId);
    if (!vendor || vendor.workspaceId !== input.workspaceId) {
      return Promise.reject(new Error("VENDOR_NOT_FOUND"));
    }

    const id = crypto.randomUUID();
    const po: StoredPo = {
      id,
      workspaceId: input.workspaceId,
      purchaseRequestId: pr.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      title: pr.title,
      amount: pr.amount,
      status: "open",
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.orders.set(id, po);
    this.requests.set(pr.id, { ...pr, status: "ordered" });
    return Promise.resolve(stripPo(po));
  }

  listPurchaseOrders(workspaceId: string): Promise<PurchaseOrderSummary[]> {
    return Promise.resolve(
      [...this.orders.values()]
        .filter((o) => o.workspaceId === workspaceId)
        .map(stripPo),
    );
  }

  getPurchaseOrder(
    workspaceId: string,
    orderId: string,
  ): Promise<PurchaseOrderSummary | undefined> {
    const row = this.orders.get(orderId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(stripPo(row));
  }

  recordDelivery(
    actorUserId: string,
    input: RecordDeliveryRequest,
  ): Promise<DeliverySummary> {
    const po = this.orders.get(input.purchaseOrderId);
    if (!po || po.workspaceId !== input.workspaceId) {
      return Promise.reject(new Error("PO_NOT_FOUND"));
    }
    if (po.status === "cancelled") {
      return Promise.reject(new Error("PO_CANCELLED"));
    }

    const status = deliveryStatus(
      input.expectedQuantity,
      input.receivedQuantity,
      input.discrepancyNote,
    );
    const id = crypto.randomUUID();
    const delivery: StoredDelivery = {
      id,
      workspaceId: input.workspaceId,
      purchaseOrderId: po.id,
      expectedQuantity: input.expectedQuantity,
      receivedQuantity: input.receivedQuantity,
      status,
      discrepancyNote: input.discrepancyNote?.trim(),
      recordedByUserId: actorUserId,
      recordedAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.deliveries.set(id, delivery);

    const poStatus: PurchaseOrderSummary["status"] =
      status === "complete" ? "delivered" : "partially_delivered";
    this.orders.set(po.id, { ...po, status: poStatus });

    return Promise.resolve(stripDelivery(delivery));
  }

  listDeliveries(workspaceId: string): Promise<DeliverySummary[]> {
    return Promise.resolve(
      [...this.deliveries.values()]
        .filter((d) => d.workspaceId === workspaceId)
        .map(stripDelivery),
    );
  }

  getDelivery(
    workspaceId: string,
    deliveryId: string,
  ): Promise<DeliverySummary | undefined> {
    const row = this.deliveries.get(deliveryId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(stripDelivery(row));
  }
}
