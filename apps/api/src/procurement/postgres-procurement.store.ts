import {
  and,
  budget,
  createDatabase,
  delivery,
  eq,
  need,
  purchaseOrder,
  purchaseRequest,
  vendor,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
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

function asDateString(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapNeed(row: typeof need.$inferSelect): NeedSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    description: row.description ?? undefined,
    estimatedAmount:
      row.estimatedAmountMinor != null
        ? { amountMinor: row.estimatedAmountMinor.toString(), currency: "IRR" }
        : undefined,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPr(row: typeof purchaseRequest.$inferSelect): PurchaseRequestSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    needId: row.needId ?? undefined,
    title: row.title,
    amount: { amountMinor: row.amountMinor.toString(), currency: "IRR" },
    vendorName: row.vendorName ?? undefined,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapBudget(row: typeof budget.$inferSelect): BudgetSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    ceiling: { amountMinor: row.ceilingMinor.toString(), currency: "IRR" },
    committedMinor: row.committedMinor.toString(),
    spentMinor: row.spentMinor.toString(),
    periodStart: asDateString(row.periodStart),
    periodEnd: asDateString(row.periodEnd),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapVendor(row: typeof vendor.$inferSelect): VendorSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    contactPhone: row.contactPhone ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPo(
  row: typeof purchaseOrder.$inferSelect,
  vendorName: string,
): PurchaseOrderSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purchaseRequestId: row.purchaseRequestId,
    vendorId: row.vendorId,
    vendorName,
    title: row.title,
    amount: { amountMinor: row.amountMinor.toString(), currency: row.currency as "IRR" },
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapDelivery(row: typeof delivery.$inferSelect): DeliverySummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purchaseOrderId: row.purchaseOrderId,
    expectedQuantity: row.expectedQuantity,
    receivedQuantity: row.receivedQuantity,
    status: row.status,
    discrepancyNote: row.discrepancyNote ?? undefined,
    recordedByUserId: row.recordedByUserId,
    recordedAt: row.recordedAt.toISOString(),
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

/** Full procurement cycle persisted in Postgres (Need → PR → Budget → Vendor → PO → Delivery). */
export class PostgresProcurementStore implements ProcurementStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresProcurementStore {
    const { db } = createDatabase(connectionString);
    return new PostgresProcurementStore(db);
  }

  createNeed(actorUserId: string, input: CreateNeedRequest): Promise<NeedSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(need)
          .where(
            and(
              eq(need.workspaceId, input.workspaceId),
              eq(need.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapNeed(existing[0]);

        const inserted = await tx
          .insert(need)
          .values({
            workspaceId: input.workspaceId,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            estimatedAmountMinor: input.estimatedAmount
              ? BigInt(input.estimatedAmount.amountMinor)
              : null,
            currency: "IRR",
            status: "open",
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("NEED_INSERT_FAILED");
        return mapNeed(row);
      },
    );
  }

  listNeeds(workspaceId: string): Promise<NeedSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx.select().from(need).where(eq(need.workspaceId, workspaceId));
      return rows.map(mapNeed);
    });
  }

  createPurchaseRequest(
    actorUserId: string,
    input: CreatePurchaseRequestRequest,
  ): Promise<PurchaseRequestSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(purchaseRequest)
          .where(
            and(
              eq(purchaseRequest.workspaceId, input.workspaceId),
              eq(purchaseRequest.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapPr(existing[0]);

        const inserted = await tx
          .insert(purchaseRequest)
          .values({
            workspaceId: input.workspaceId,
            needId: input.needId || null,
            title: input.title.trim(),
            amountMinor: BigInt(input.amount.amountMinor),
            currency: "IRR",
            vendorName: input.vendorName?.trim() || null,
            status: "draft",
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("PR_INSERT_FAILED");
        return mapPr(row);
      },
    );
  }

  submitPurchaseRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<PurchaseRequestSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(purchaseRequest)
        .where(
          and(eq(purchaseRequest.id, requestId), eq(purchaseRequest.workspaceId, workspaceId)),
        )
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("PR_NOT_FOUND");
      if (existing.status !== "draft") throw new Error("PR_STATUS");
      const updated = await tx
        .update(purchaseRequest)
        .set({ status: "submitted" })
        .where(eq(purchaseRequest.id, requestId))
        .returning();
      return mapPr(updated[0]!);
    });
  }

  decidePurchaseRequest(
    workspaceId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<PurchaseRequestSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(purchaseRequest)
        .where(
          and(eq(purchaseRequest.id, requestId), eq(purchaseRequest.workspaceId, workspaceId)),
        )
        .limit(1);
      const existing = rows[0];
      if (!existing) throw new Error("PR_NOT_FOUND");
      if (existing.status !== "submitted") throw new Error("PR_STATUS");
      const next = decision === "approved" ? "approved" : "rejected";
      const updated = await tx
        .update(purchaseRequest)
        .set({ status: next })
        .where(eq(purchaseRequest.id, requestId))
        .returning();
      return mapPr(updated[0]!);
    });
  }

  listPurchaseRequests(workspaceId: string): Promise<PurchaseRequestSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(purchaseRequest)
        .where(eq(purchaseRequest.workspaceId, workspaceId));
      return rows.map(mapPr);
    });
  }

  getPurchaseRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<PurchaseRequestSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(purchaseRequest)
        .where(
          and(eq(purchaseRequest.id, requestId), eq(purchaseRequest.workspaceId, workspaceId)),
        )
        .limit(1);
      return rows[0] ? mapPr(rows[0]) : undefined;
    });
  }

  createBudget(input: CreateBudgetRequest): Promise<BudgetSummary> {
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const existing = await tx
        .select()
        .from(budget)
        .where(
          and(
            eq(budget.workspaceId, input.workspaceId),
            eq(budget.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) return mapBudget(existing[0]);

      const inserted = await tx
        .insert(budget)
        .values({
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          ceilingMinor: BigInt(input.ceiling.amountMinor),
          committedMinor: 0n,
          spentMinor: 0n,
          currency: "IRR",
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: "open",
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("BUDGET_INSERT_FAILED");
      return mapBudget(row);
    });
  }

  listBudgets(workspaceId: string): Promise<BudgetSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx.select().from(budget).where(eq(budget.workspaceId, workspaceId));
      return rows.map(mapBudget);
    });
  }

  applyCompanyExpenseSpend(
    workspaceId: string,
    amountMinor: string,
    budgetId?: string,
  ): Promise<BudgetSummary | null> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(budget)
        .where(and(eq(budget.workspaceId, workspaceId), eq(budget.status, "open")));
      const target = budgetId
        ? rows.find((row) => row.id === budgetId)
        : rows[0];
      if (!target) return null;
      const nextSpent = target.spentMinor + BigInt(amountMinor);
      const updated = await tx
        .update(budget)
        .set({ spentMinor: nextSpent })
        .where(eq(budget.id, target.id))
        .returning();
      return updated[0] ? mapBudget(updated[0]) : null;
    });
  }

  createVendor(input: CreateVendorRequest): Promise<VendorSummary> {
    return withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      const existing = await tx
        .select()
        .from(vendor)
        .where(
          and(
            eq(vendor.workspaceId, input.workspaceId),
            eq(vendor.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) return mapVendor(existing[0]);

      const inserted = await tx
        .insert(vendor)
        .values({
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          contactPhone: input.contactPhone?.trim() || null,
          contactEmail: input.contactEmail?.trim() || null,
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("VENDOR_INSERT_FAILED");
      return mapVendor(row);
    });
  }

  listVendors(workspaceId: string): Promise<VendorSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx.select().from(vendor).where(eq(vendor.workspaceId, workspaceId));
      return rows.map(mapVendor);
    });
  }

  getVendor(workspaceId: string, vendorId: string): Promise<VendorSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(vendor)
        .where(and(eq(vendor.id, vendorId), eq(vendor.workspaceId, workspaceId)))
        .limit(1);
      return rows[0] ? mapVendor(rows[0]) : undefined;
    });
  }

  createPurchaseOrder(
    actorUserId: string,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const idempotent = await tx
          .select({
            po: purchaseOrder,
            vendorName: vendor.name,
          })
          .from(purchaseOrder)
          .innerJoin(vendor, eq(purchaseOrder.vendorId, vendor.id))
          .where(
            and(
              eq(purchaseOrder.workspaceId, input.workspaceId),
              eq(purchaseOrder.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (idempotent[0]) {
          return mapPo(idempotent[0].po, idempotent[0].vendorName);
        }

        const prRows = await tx
          .select()
          .from(purchaseRequest)
          .where(
            and(
              eq(purchaseRequest.id, input.purchaseRequestId),
              eq(purchaseRequest.workspaceId, input.workspaceId),
            ),
          )
          .limit(1);
        const pr = prRows[0];
        if (!pr) throw new Error("PR_NOT_FOUND");
        if (pr.status !== "approved") throw new Error("PR_NOT_APPROVED");

        const vendorRows = await tx
          .select()
          .from(vendor)
          .where(
            and(eq(vendor.id, input.vendorId), eq(vendor.workspaceId, input.workspaceId)),
          )
          .limit(1);
        const vendorRow = vendorRows[0];
        if (!vendorRow) throw new Error("VENDOR_NOT_FOUND");

        const inserted = await tx
          .insert(purchaseOrder)
          .values({
            workspaceId: input.workspaceId,
            purchaseRequestId: pr.id,
            vendorId: vendorRow.id,
            title: pr.title,
            amountMinor: pr.amountMinor,
            currency: pr.currency,
            status: "open",
            createdByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const poRow = inserted[0];
        if (!poRow) throw new Error("PO_INSERT_FAILED");

        await tx
          .update(purchaseRequest)
          .set({ status: "ordered" })
          .where(eq(purchaseRequest.id, pr.id));

        return mapPo(poRow, vendorRow.name);
      },
    );
  }

  listPurchaseOrders(workspaceId: string): Promise<PurchaseOrderSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select({ po: purchaseOrder, vendorName: vendor.name })
        .from(purchaseOrder)
        .innerJoin(vendor, eq(purchaseOrder.vendorId, vendor.id))
        .where(eq(purchaseOrder.workspaceId, workspaceId));
      return rows.map((row) => mapPo(row.po, row.vendorName));
    });
  }

  getPurchaseOrder(
    workspaceId: string,
    orderId: string,
  ): Promise<PurchaseOrderSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select({ po: purchaseOrder, vendorName: vendor.name })
        .from(purchaseOrder)
        .innerJoin(vendor, eq(purchaseOrder.vendorId, vendor.id))
        .where(
          and(eq(purchaseOrder.id, orderId), eq(purchaseOrder.workspaceId, workspaceId)),
        )
        .limit(1);
      return rows[0] ? mapPo(rows[0].po, rows[0].vendorName) : undefined;
    });
  }

  recordDelivery(
    actorUserId: string,
    input: RecordDeliveryRequest,
  ): Promise<DeliverySummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(delivery)
          .where(
            and(
              eq(delivery.workspaceId, input.workspaceId),
              eq(delivery.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapDelivery(existing[0]);

        const poRows = await tx
          .select()
          .from(purchaseOrder)
          .where(
            and(
              eq(purchaseOrder.id, input.purchaseOrderId),
              eq(purchaseOrder.workspaceId, input.workspaceId),
            ),
          )
          .limit(1);
        const po = poRows[0];
        if (!po) throw new Error("PO_NOT_FOUND");
        if (po.status === "cancelled") throw new Error("PO_CANCELLED");

        const status = deliveryStatus(
          input.expectedQuantity,
          input.receivedQuantity,
          input.discrepancyNote,
        );

        const inserted = await tx
          .insert(delivery)
          .values({
            workspaceId: input.workspaceId,
            purchaseOrderId: po.id,
            expectedQuantity: input.expectedQuantity,
            receivedQuantity: input.receivedQuantity,
            status,
            discrepancyNote: input.discrepancyNote?.trim() || null,
            recordedByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("DELIVERY_INSERT_FAILED");

        const poStatus: PurchaseOrderSummary["status"] =
          status === "complete" ? "delivered" : "partially_delivered";
        await tx
          .update(purchaseOrder)
          .set({ status: poStatus })
          .where(eq(purchaseOrder.id, po.id));

        return mapDelivery(row);
      },
    );
  }

  listDeliveries(workspaceId: string): Promise<DeliverySummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(delivery)
        .where(eq(delivery.workspaceId, workspaceId));
      return rows.map(mapDelivery);
    });
  }

  getDelivery(
    workspaceId: string,
    deliveryId: string,
  ): Promise<DeliverySummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(delivery)
        .where(
          and(eq(delivery.id, deliveryId), eq(delivery.workspaceId, workspaceId)),
        )
        .limit(1);
      return rows[0] ? mapDelivery(rows[0]) : undefined;
    });
  }
}
