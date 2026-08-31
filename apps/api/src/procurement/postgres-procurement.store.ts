import {
  and,
  budget,
  createDatabase,
  eq,
  need,
  purchaseRequest,
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
import { MemoryProcurementStore } from "./procurement.store.js";
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

/**
 * Need / PR / Budget → Postgres. Vendor / PO / Delivery stay in-process memory
 * until asset schema stores are wired end-to-end.
 */
export class PostgresProcurementStore implements ProcurementStore {
  readonly persistence = "postgres" as const;
  private readonly cycle = new MemoryProcurementStore();

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

  createVendor(input: CreateVendorRequest): Promise<VendorSummary> {
    return this.cycle.createVendor(input);
  }

  listVendors(workspaceId: string): Promise<VendorSummary[]> {
    return this.cycle.listVendors(workspaceId);
  }

  getVendor(workspaceId: string, vendorId: string): Promise<VendorSummary | undefined> {
    return this.cycle.getVendor(workspaceId, vendorId);
  }

  async createPurchaseOrder(
    actorUserId: string,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderSummary> {
    const pr = await this.getPurchaseRequest(input.workspaceId, input.purchaseRequestId);
    if (!pr) throw new Error("PR_NOT_FOUND");
    if (pr.status !== "approved") throw new Error("PR_NOT_APPROVED");

    this.cycle.seedPurchaseRequest(pr);
    const po = await this.cycle.createPurchaseOrder(actorUserId, input);

    await withTenantContext(this.db, { workspaceId: input.workspaceId }, async (tx) => {
      await tx
        .update(purchaseRequest)
        .set({ status: "ordered" })
        .where(eq(purchaseRequest.id, pr.id));
    });

    return po;
  }

  listPurchaseOrders(workspaceId: string): Promise<PurchaseOrderSummary[]> {
    return this.cycle.listPurchaseOrders(workspaceId);
  }

  getPurchaseOrder(
    workspaceId: string,
    orderId: string,
  ): Promise<PurchaseOrderSummary | undefined> {
    return this.cycle.getPurchaseOrder(workspaceId, orderId);
  }

  recordDelivery(
    actorUserId: string,
    input: RecordDeliveryRequest,
  ): Promise<DeliverySummary> {
    return this.cycle.recordDelivery(actorUserId, input);
  }

  listDeliveries(workspaceId: string): Promise<DeliverySummary[]> {
    return this.cycle.listDeliveries(workspaceId);
  }

  getDelivery(
    workspaceId: string,
    deliveryId: string,
  ): Promise<DeliverySummary | undefined> {
    return this.cycle.getDelivery(workspaceId, deliveryId);
  }
}
