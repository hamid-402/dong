import {
  and,
  createDatabase,
  creditPurchase,
  creditPurchasePayment,
  desc,
  eq,
  paymentOnBehalf,
  paymentReceipt,
  pettyCashFund,
  pettyCashMovement,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateCreditPurchasePaymentRequest,
  CreateCreditPurchaseRequest,
  CreateOnBehalfPaymentRequest,
  CreatePaymentReceiptRequest,
  CreatePettyCashFundRequest,
  CreatePettyCashMovementRequest,
  CreditPurchaseStatus,
  OnBehalfPaymentStatus,
  PaymentReceiptStatus,
} from "@dang/contracts";
import type {
  PaymentOpsStore,
  PaymentOpsWriteOptions,
  StoredCreditPurchase,
  StoredCreditPurchasePayment,
  StoredOnBehalfPayment,
  StoredPaymentReceipt,
  StoredPettyCashFund,
  StoredPettyCashMovement,
} from "./payment-ops.types.js";

function mapReceipt(row: typeof paymentReceipt.$inferSelect): StoredPaymentReceipt {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    settlementId: row.settlementId ?? undefined,
    memberInvoiceId: row.memberInvoiceId ?? undefined,
    payerUserId: row.payerUserId,
    method: row.method,
    amount: {
      amountMinor: row.amountMinor.toString(),
      currency: (row.currency as "IRR") || "IRR",
    },
    paidAt: row.paidAt.toISOString(),
    referenceNo: row.referenceNo ?? undefined,
    destHolderName: row.destHolderName ?? undefined,
    destLast4: row.destLast4 ?? undefined,
    attachmentId: row.attachmentId ?? undefined,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId ?? undefined,
    reviewedAt: row.reviewedAt?.toISOString(),
    reviewNote: row.reviewNote ?? undefined,
    journalEntryId: row.journalEntryId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapFund(row: typeof pettyCashFund.$inferSelect): StoredPettyCashFund {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    custodianUserId: row.custodianUserId,
    openingBalanceMinor: row.openingBalanceMinor.toString(),
    currency: "IRR",
    active: row.active,
    createdByUserId: row.createdByUserId,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapMovement(
  row: typeof pettyCashMovement.$inferSelect,
): StoredPettyCashMovement {
  return {
    id: row.id,
    fundId: row.fundId,
    kind: row.kind,
    amountMinor: row.amountMinor.toString(),
    expenseId: row.expenseId ?? undefined,
    settlementId: row.settlementId ?? undefined,
    actorUserId: row.actorUserId,
    occurredAt: row.occurredAt.toISOString(),
    note: row.note ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPurchase(
  row: typeof creditPurchase.$inferSelect,
): StoredCreditPurchase {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    supplierRef: row.supplierRef,
    amountMinor: row.amountMinor.toString(),
    currency: "IRR",
    purchasedAt: row.purchasedAt.toISOString(),
    dueDate: row.dueDate,
    status: row.status,
    expenseId: row.expenseId ?? undefined,
    createdByUserId: row.createdByUserId,
    note: row.note ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCreditPayment(
  row: typeof creditPurchasePayment.$inferSelect,
): StoredCreditPurchasePayment {
  return {
    id: row.id,
    creditPurchaseId: row.creditPurchaseId,
    amountMinor: row.amountMinor.toString(),
    paidAt: row.paidAt.toISOString(),
    sourceKind: row.sourceKind,
    sourceRefId: row.sourceRefId ?? undefined,
    actorUserId: row.actorUserId,
    receiptId: row.receiptId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapOnBehalf(
  row: typeof paymentOnBehalf.$inferSelect,
): StoredOnBehalfPayment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    debtorUserId: row.debtorUserId,
    payerUserId: row.payerUserId,
    amount: {
      amountMinor: row.amountMinor.toString(),
      currency: (row.currency as "IRR") || "IRR",
    },
    settlementId: row.settlementId ?? undefined,
    method: row.method,
    note: row.note ?? undefined,
    status: row.status,
    initiatedByUserId: row.initiatedByUserId,
    approvedByUserId: row.approvedByUserId ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    rejectNote: row.rejectNote ?? undefined,
    journalEntryId: row.journalEntryId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresPaymentOpsStore implements PaymentOpsStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresPaymentOpsStore {
    const { db } = createDatabase(connectionString);
    return new PostgresPaymentOpsStore(db);
  }

  listReceipts(
    workspaceId: string,
    status?: PaymentReceiptStatus,
  ): Promise<StoredPaymentReceipt[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = status
        ? await tx
            .select()
            .from(paymentReceipt)
            .where(
              and(
                eq(paymentReceipt.workspaceId, workspaceId),
                eq(paymentReceipt.status, status),
              ),
            )
            .orderBy(desc(paymentReceipt.createdAt))
        : await tx
            .select()
            .from(paymentReceipt)
            .where(eq(paymentReceipt.workspaceId, workspaceId))
            .orderBy(desc(paymentReceipt.createdAt));
      return rows.map(mapReceipt);
    });
  }

  getReceipt(
    workspaceId: string,
    receiptId: string,
  ): Promise<StoredPaymentReceipt | null> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(paymentReceipt)
        .where(
          and(
            eq(paymentReceipt.workspaceId, workspaceId),
            eq(paymentReceipt.id, receiptId),
          ),
        )
        .limit(1);
      return rows[0] ? mapReceipt(rows[0]) : null;
    });
  }

  createReceipt(
    workspaceId: string,
    payerUserId: string,
    input: CreatePaymentReceiptRequest,
  ): Promise<StoredPaymentReceipt> {
    return withTenantContext(this.db, { workspaceId, userId: payerUserId }, async (tx) => {
      const existing = await tx
        .select()
        .from(paymentReceipt)
        .where(
          and(
            eq(paymentReceipt.workspaceId, workspaceId),
            eq(paymentReceipt.idempotencyKey, input.idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (existing[0]) return mapReceipt(existing[0]);

      const inserted = await tx
        .insert(paymentReceipt)
        .values({
          workspaceId,
          settlementId: input.settlementId ?? null,
          memberInvoiceId: input.memberInvoiceId ?? null,
          payerUserId,
          method: input.method,
          amountMinor: BigInt(input.amountMinor),
          currency: "IRR",
          paidAt: new Date(input.paidAt),
          referenceNo: input.referenceNo ?? null,
          destHolderName: input.destHolderName ?? null,
          destLast4: input.destLast4 ?? null,
          attachmentId: input.attachmentId ?? null,
          status: "submitted",
          idempotencyKey: input.idempotencyKey.trim(),
        })
        .returning();
      return mapReceipt(inserted[0]!);
    });
  }

  reviewReceipt(
    workspaceId: string,
    receiptId: string,
    update: {
      status: "approved" | "rejected";
      reviewedByUserId: string;
      reviewNote?: string;
      journalEntryId?: string;
    },
    options?: PaymentOpsWriteOptions,
  ): Promise<StoredPaymentReceipt> {
    const work = async (tx: AppDatabase) => {
      const rows = await tx
        .select()
        .from(paymentReceipt)
        .where(
          and(
            eq(paymentReceipt.workspaceId, workspaceId),
            eq(paymentReceipt.id, receiptId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error("RECEIPT_NOT_FOUND");
      if (row.status !== "submitted") throw new Error("RECEIPT_ALREADY_REVIEWED");

      const updated = await tx
        .update(paymentReceipt)
        .set({
          status: update.status,
          reviewedByUserId: update.reviewedByUserId,
          reviewedAt: new Date(),
          reviewNote: update.reviewNote ?? null,
          journalEntryId: update.journalEntryId ?? null,
        })
        .where(eq(paymentReceipt.id, receiptId))
        .returning();
      return mapReceipt(updated[0]!);
    };

    if (options?.tx) return work(options.tx);
    return withTenantContext(
      this.db,
      { workspaceId, userId: update.reviewedByUserId },
      work,
    );
  }

  listFunds(workspaceId: string): Promise<StoredPettyCashFund[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(pettyCashFund)
        .where(eq(pettyCashFund.workspaceId, workspaceId));
      return rows.map(mapFund);
    });
  }

  getFund(
    workspaceId: string,
    fundId: string,
  ): Promise<StoredPettyCashFund | null> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(pettyCashFund)
        .where(
          and(
            eq(pettyCashFund.workspaceId, workspaceId),
            eq(pettyCashFund.id, fundId),
          ),
        )
        .limit(1);
      return rows[0] ? mapFund(rows[0]) : null;
    });
  }

  createFund(
    workspaceId: string,
    createdByUserId: string,
    input: CreatePettyCashFundRequest & { custodianUserId: string },
  ): Promise<StoredPettyCashFund> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: createdByUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(pettyCashFund)
          .where(
            and(
              eq(pettyCashFund.workspaceId, workspaceId),
              eq(pettyCashFund.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapFund(existing[0]);

        const inserted = await tx
          .insert(pettyCashFund)
          .values({
            workspaceId,
            name: input.name.trim(),
            custodianUserId: input.custodianUserId,
            openingBalanceMinor: BigInt(input.openingBalanceMinor?.trim() || "0"),
            currency: "IRR",
            active: true,
            createdByUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        return mapFund(inserted[0]!);
      },
    );
  }

  listMovements(fundId: string): Promise<StoredPettyCashMovement[]> {
    return this.db
      .select()
      .from(pettyCashMovement)
      .where(eq(pettyCashMovement.fundId, fundId))
      .then((rows) => rows.map(mapMovement));
  }

  createMovement(
    fundId: string,
    actorUserId: string,
    input: CreatePettyCashMovementRequest & { occurredAt: string },
  ): Promise<StoredPettyCashMovement> {
    return this.db.transaction(async (tx) => {
      const fundRows = await tx
        .select()
        .from(pettyCashFund)
        .where(eq(pettyCashFund.id, fundId))
        .limit(1);
      const fund = fundRows[0];
      if (!fund) throw new Error("PETTY_CASH_FUND_NOT_FOUND");

      return withTenantContext(
        this.db,
        { workspaceId: fund.workspaceId, userId: actorUserId },
        async (tenantTx) => {
          const existing = await tenantTx
            .select()
            .from(pettyCashMovement)
            .where(
              and(
                eq(pettyCashMovement.fundId, fundId),
                eq(pettyCashMovement.idempotencyKey, input.idempotencyKey.trim()),
              ),
            )
            .limit(1);
          if (existing[0]) return mapMovement(existing[0]);

          const inserted = await tenantTx
            .insert(pettyCashMovement)
            .values({
              fundId,
              kind: input.kind,
              amountMinor: BigInt(input.amountMinor),
              expenseId: input.expenseId ?? null,
              settlementId: input.settlementId ?? null,
              actorUserId,
              occurredAt: new Date(input.occurredAt),
              note: input.note ?? null,
              idempotencyKey: input.idempotencyKey.trim(),
            })
            .returning();
          return mapMovement(inserted[0]!);
        },
      );
    });
  }

  listCreditPurchases(
    workspaceId: string,
    status?: CreditPurchaseStatus,
  ): Promise<StoredCreditPurchase[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = status
        ? await tx
            .select()
            .from(creditPurchase)
            .where(
              and(
                eq(creditPurchase.workspaceId, workspaceId),
                eq(creditPurchase.status, status),
              ),
            )
            .orderBy(desc(creditPurchase.createdAt))
        : await tx
            .select()
            .from(creditPurchase)
            .where(eq(creditPurchase.workspaceId, workspaceId))
            .orderBy(desc(creditPurchase.createdAt));
      return rows.map(mapPurchase);
    });
  }

  getCreditPurchase(
    workspaceId: string,
    purchaseId: string,
  ): Promise<StoredCreditPurchase | null> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(creditPurchase)
        .where(
          and(
            eq(creditPurchase.workspaceId, workspaceId),
            eq(creditPurchase.id, purchaseId),
          ),
        )
        .limit(1);
      return rows[0] ? mapPurchase(rows[0]) : null;
    });
  }

  createCreditPurchase(
    workspaceId: string,
    createdByUserId: string,
    input: CreateCreditPurchaseRequest,
  ): Promise<StoredCreditPurchase> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: createdByUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(creditPurchase)
          .where(
            and(
              eq(creditPurchase.workspaceId, workspaceId),
              eq(creditPurchase.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapPurchase(existing[0]);

        const inserted = await tx
          .insert(creditPurchase)
          .values({
            workspaceId,
            supplierRef: input.supplierRef.trim(),
            amountMinor: BigInt(input.amountMinor),
            currency: "IRR",
            purchasedAt: new Date(input.purchasedAt),
            dueDate: input.dueDate,
            status: "open",
            expenseId: input.expenseId ?? null,
            createdByUserId,
            note: input.note ?? null,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        return mapPurchase(inserted[0]!);
      },
    );
  }

  listCreditPayments(
    purchaseId: string,
  ): Promise<StoredCreditPurchasePayment[]> {
    return this.db
      .select()
      .from(creditPurchasePayment)
      .where(eq(creditPurchasePayment.creditPurchaseId, purchaseId))
      .then((rows) => rows.map(mapCreditPayment));
  }

  createCreditPayment(
    purchaseId: string,
    actorUserId: string,
    input: CreateCreditPurchasePaymentRequest & { paidAt: string },
  ): Promise<StoredCreditPurchasePayment> {
    return this.db.transaction(async () => {
      const purchaseRows = await this.db
        .select()
        .from(creditPurchase)
        .where(eq(creditPurchase.id, purchaseId))
        .limit(1);
      const purchase = purchaseRows[0];
      if (!purchase) throw new Error("CREDIT_PURCHASE_NOT_FOUND");

      return withTenantContext(
        this.db,
        { workspaceId: purchase.workspaceId, userId: actorUserId },
        async (tx) => {
          const existing = await tx
            .select()
            .from(creditPurchasePayment)
            .where(
              and(
                eq(creditPurchasePayment.creditPurchaseId, purchaseId),
                eq(
                  creditPurchasePayment.idempotencyKey,
                  input.idempotencyKey.trim(),
                ),
              ),
            )
            .limit(1);
          if (existing[0]) return mapCreditPayment(existing[0]);

          const inserted = await tx
            .insert(creditPurchasePayment)
            .values({
              creditPurchaseId: purchaseId,
              amountMinor: BigInt(input.amountMinor),
              paidAt: new Date(input.paidAt),
              sourceKind: input.sourceKind.trim(),
              sourceRefId: input.sourceRefId ?? null,
              actorUserId,
              receiptId: input.receiptId ?? null,
              idempotencyKey: input.idempotencyKey.trim(),
            })
            .returning();
          return mapCreditPayment(inserted[0]!);
        },
      );
    });
  }

  updateCreditPurchaseStatus(
    workspaceId: string,
    purchaseId: string,
    status: CreditPurchaseStatus,
  ): Promise<StoredCreditPurchase> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const updated = await tx
        .update(creditPurchase)
        .set({ status })
        .where(
          and(
            eq(creditPurchase.workspaceId, workspaceId),
            eq(creditPurchase.id, purchaseId),
          ),
        )
        .returning();
      if (!updated[0]) throw new Error("CREDIT_PURCHASE_NOT_FOUND");
      return mapPurchase(updated[0]);
    });
  }

  listOnBehalf(
    workspaceId: string,
    status?: OnBehalfPaymentStatus,
  ): Promise<StoredOnBehalfPayment[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = status
        ? await tx
            .select()
            .from(paymentOnBehalf)
            .where(
              and(
                eq(paymentOnBehalf.workspaceId, workspaceId),
                eq(paymentOnBehalf.status, status),
              ),
            )
            .orderBy(desc(paymentOnBehalf.createdAt))
        : await tx
            .select()
            .from(paymentOnBehalf)
            .where(eq(paymentOnBehalf.workspaceId, workspaceId))
            .orderBy(desc(paymentOnBehalf.createdAt));
      return rows.map(mapOnBehalf);
    });
  }

  getOnBehalf(
    workspaceId: string,
    onBehalfId: string,
  ): Promise<StoredOnBehalfPayment | null> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(paymentOnBehalf)
        .where(
          and(
            eq(paymentOnBehalf.workspaceId, workspaceId),
            eq(paymentOnBehalf.id, onBehalfId),
          ),
        )
        .limit(1);
      return rows[0] ? mapOnBehalf(rows[0]) : null;
    });
  }

  createOnBehalf(
    workspaceId: string,
    initiatedByUserId: string,
    input: CreateOnBehalfPaymentRequest,
  ): Promise<StoredOnBehalfPayment> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: initiatedByUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(paymentOnBehalf)
          .where(
            and(
              eq(paymentOnBehalf.workspaceId, workspaceId),
              eq(paymentOnBehalf.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapOnBehalf(existing[0]);

        const inserted = await tx
          .insert(paymentOnBehalf)
          .values({
            workspaceId,
            debtorUserId: input.debtorUserId,
            payerUserId: input.payerUserId,
            amountMinor: BigInt(input.amountMinor),
            currency: "IRR",
            settlementId: input.settlementId ?? null,
            method: input.method,
            note: input.note ?? null,
            status: "pending",
            initiatedByUserId,
            idempotencyKey: input.idempotencyKey.trim(),
          })
          .returning();
        return mapOnBehalf(inserted[0]!);
      },
    );
  }

  reviewOnBehalf(
    workspaceId: string,
    onBehalfId: string,
    update: {
      status: "approved" | "rejected";
      approvedByUserId: string;
      rejectNote?: string;
      journalEntryId?: string;
    },
    options?: PaymentOpsWriteOptions,
  ): Promise<StoredOnBehalfPayment> {
    const run = async (tx: AppDatabase) => {
      const existing = await tx
        .select()
        .from(paymentOnBehalf)
        .where(
          and(
            eq(paymentOnBehalf.workspaceId, workspaceId),
            eq(paymentOnBehalf.id, onBehalfId),
          ),
        )
        .limit(1);
      const row = existing[0];
      if (!row) throw new Error("ON_BEHALF_NOT_FOUND");
      if (row.status !== "pending") throw new Error("ON_BEHALF_ALREADY_REVIEWED");

      const updated = await tx
        .update(paymentOnBehalf)
        .set({
          status: update.status,
          approvedByUserId: update.approvedByUserId,
          approvedAt: new Date(),
          rejectNote: update.rejectNote ?? null,
          journalEntryId: update.journalEntryId ?? null,
        })
        .where(
          and(
            eq(paymentOnBehalf.workspaceId, workspaceId),
            eq(paymentOnBehalf.id, onBehalfId),
          ),
        )
        .returning();
      return mapOnBehalf(updated[0]!);
    };

    if (options?.tx) return run(options.tx);
    return withTenantContext(
      this.db,
      { workspaceId, userId: update.approvedByUserId },
      run,
    );
  }
}
