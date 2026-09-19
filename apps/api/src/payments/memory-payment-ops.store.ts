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
  StoredCreditPurchase,
  StoredCreditPurchasePayment,
  StoredOnBehalfPayment,
  StoredPaymentReceipt,
  StoredPettyCashFund,
  StoredPettyCashMovement,
} from "./payment-ops.types.js";

export class MemoryPaymentOpsStore implements PaymentOpsStore {
  readonly persistence = "memory" as const;

  private readonly receipts = new Map<string, StoredPaymentReceipt>();
  private readonly funds = new Map<string, StoredPettyCashFund>();
  private readonly movements = new Map<string, StoredPettyCashMovement>();
  private readonly purchases = new Map<string, StoredCreditPurchase>();
  private readonly creditPayments = new Map<string, StoredCreditPurchasePayment>();
  private readonly onBehalf = new Map<string, StoredOnBehalfPayment>();

  listReceipts(
    workspaceId: string,
    status?: PaymentReceiptStatus,
  ): Promise<StoredPaymentReceipt[]> {
    return Promise.resolve(
      [...this.receipts.values()]
        .filter(
          (r) =>
            r.workspaceId === workspaceId &&
            (status == null || r.status === status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  getReceipt(
    workspaceId: string,
    receiptId: string,
  ): Promise<StoredPaymentReceipt | null> {
    const row = this.receipts.get(receiptId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  createReceipt(
    workspaceId: string,
    payerUserId: string,
    input: CreatePaymentReceiptRequest,
  ): Promise<StoredPaymentReceipt> {
    const existing = [...this.receipts.values()].find(
      (r) =>
        r.workspaceId === workspaceId &&
        r.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(existing);

    const now = new Date().toISOString();
    const row: StoredPaymentReceipt = {
      id: crypto.randomUUID(),
      workspaceId,
      settlementId: input.settlementId,
      memberInvoiceId: input.memberInvoiceId,
      payerUserId,
      method: input.method,
      amount: { amountMinor: input.amountMinor, currency: "IRR" },
      paidAt: input.paidAt,
      referenceNo: input.referenceNo,
      destHolderName: input.destHolderName,
      destLast4: input.destLast4,
      attachmentId: input.attachmentId,
      status: "submitted",
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: now,
    };
    this.receipts.set(row.id, row);
    return Promise.resolve(row);
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
  ): Promise<StoredPaymentReceipt> {
    const row = this.receipts.get(receiptId);
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error("RECEIPT_NOT_FOUND");
    }
    if (row.status !== "submitted") {
      throw new Error("RECEIPT_ALREADY_REVIEWED");
    }
    const next: StoredPaymentReceipt = {
      ...row,
      status: update.status,
      reviewedByUserId: update.reviewedByUserId,
      reviewedAt: new Date().toISOString(),
      reviewNote: update.reviewNote,
      journalEntryId: update.journalEntryId,
    };
    this.receipts.set(receiptId, next);
    return Promise.resolve(next);
  }

  listFunds(workspaceId: string): Promise<StoredPettyCashFund[]> {
    return Promise.resolve(
      [...this.funds.values()].filter((f) => f.workspaceId === workspaceId),
    );
  }

  getFund(
    workspaceId: string,
    fundId: string,
  ): Promise<StoredPettyCashFund | null> {
    const row = this.funds.get(fundId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  createFund(
    workspaceId: string,
    createdByUserId: string,
    input: CreatePettyCashFundRequest & { custodianUserId: string },
  ): Promise<StoredPettyCashFund> {
    const existing = [...this.funds.values()].find(
      (f) =>
        f.workspaceId === workspaceId &&
        f.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(existing);

    const row: StoredPettyCashFund = {
      id: crypto.randomUUID(),
      workspaceId,
      name: input.name.trim(),
      custodianUserId: input.custodianUserId,
      openingBalanceMinor: input.openingBalanceMinor?.trim() || "0",
      currency: "IRR",
      active: true,
      createdByUserId,
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: new Date().toISOString(),
    };
    this.funds.set(row.id, row);
    return Promise.resolve(row);
  }

  listMovements(fundId: string): Promise<StoredPettyCashMovement[]> {
    return Promise.resolve(
      [...this.movements.values()]
        .filter((m) => m.fundId === fundId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    );
  }

  createMovement(
    fundId: string,
    actorUserId: string,
    input: CreatePettyCashMovementRequest & { occurredAt: string },
  ): Promise<StoredPettyCashMovement> {
    const existing = [...this.movements.values()].find(
      (m) =>
        m.fundId === fundId &&
        m.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(existing);

    const row: StoredPettyCashMovement = {
      id: crypto.randomUUID(),
      fundId,
      kind: input.kind,
      amountMinor: input.amountMinor,
      expenseId: input.expenseId,
      settlementId: input.settlementId,
      actorUserId,
      occurredAt: input.occurredAt,
      note: input.note,
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: new Date().toISOString(),
    };
    this.movements.set(row.id, row);
    return Promise.resolve(row);
  }

  listCreditPurchases(
    workspaceId: string,
    status?: CreditPurchaseStatus,
  ): Promise<StoredCreditPurchase[]> {
    return Promise.resolve(
      [...this.purchases.values()]
        .filter(
          (p) =>
            p.workspaceId === workspaceId &&
            (status == null || p.status === status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  getCreditPurchase(
    workspaceId: string,
    purchaseId: string,
  ): Promise<StoredCreditPurchase | null> {
    const row = this.purchases.get(purchaseId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  createCreditPurchase(
    workspaceId: string,
    createdByUserId: string,
    input: CreateCreditPurchaseRequest,
  ): Promise<StoredCreditPurchase> {
    const existing = [...this.purchases.values()].find(
      (p) =>
        p.workspaceId === workspaceId &&
        p.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(existing);

    const row: StoredCreditPurchase = {
      id: crypto.randomUUID(),
      workspaceId,
      supplierRef: input.supplierRef.trim(),
      amountMinor: input.amountMinor,
      currency: "IRR",
      purchasedAt: input.purchasedAt,
      dueDate: input.dueDate,
      status: "open",
      expenseId: input.expenseId,
      createdByUserId,
      note: input.note,
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: new Date().toISOString(),
    };
    this.purchases.set(row.id, row);
    return Promise.resolve(row);
  }

  listCreditPayments(
    purchaseId: string,
  ): Promise<StoredCreditPurchasePayment[]> {
    return Promise.resolve(
      [...this.creditPayments.values()]
        .filter((p) => p.creditPurchaseId === purchaseId)
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt)),
    );
  }

  createCreditPayment(
    purchaseId: string,
    actorUserId: string,
    input: CreateCreditPurchasePaymentRequest & { paidAt: string },
  ): Promise<StoredCreditPurchasePayment> {
    const existing = [...this.creditPayments.values()].find(
      (p) =>
        p.creditPurchaseId === purchaseId &&
        p.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(existing);

    const row: StoredCreditPurchasePayment = {
      id: crypto.randomUUID(),
      creditPurchaseId: purchaseId,
      amountMinor: input.amountMinor,
      paidAt: input.paidAt,
      sourceKind: input.sourceKind.trim(),
      sourceRefId: input.sourceRefId,
      actorUserId,
      receiptId: input.receiptId,
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: new Date().toISOString(),
    };
    this.creditPayments.set(row.id, row);
    return Promise.resolve(row);
  }

  updateCreditPurchaseStatus(
    workspaceId: string,
    purchaseId: string,
    status: CreditPurchaseStatus,
  ): Promise<StoredCreditPurchase> {
    const row = this.purchases.get(purchaseId);
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error("CREDIT_PURCHASE_NOT_FOUND");
    }
    const next = { ...row, status };
    this.purchases.set(purchaseId, next);
    return Promise.resolve(next);
  }

  listOnBehalf(
    workspaceId: string,
    status?: OnBehalfPaymentStatus,
  ): Promise<StoredOnBehalfPayment[]> {
    return Promise.resolve(
      [...this.onBehalf.values()]
        .filter(
          (r) =>
            r.workspaceId === workspaceId &&
            (status == null || r.status === status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  getOnBehalf(
    workspaceId: string,
    onBehalfId: string,
  ): Promise<StoredOnBehalfPayment | null> {
    const row = this.onBehalf.get(onBehalfId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  createOnBehalf(
    workspaceId: string,
    initiatedByUserId: string,
    input: CreateOnBehalfPaymentRequest,
  ): Promise<StoredOnBehalfPayment> {
    const existing = [...this.onBehalf.values()].find(
      (r) =>
        r.workspaceId === workspaceId &&
        r.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(existing);

    const now = new Date().toISOString();
    const row: StoredOnBehalfPayment = {
      id: crypto.randomUUID(),
      workspaceId,
      debtorUserId: input.debtorUserId,
      payerUserId: input.payerUserId,
      amount: { amountMinor: input.amountMinor, currency: "IRR" },
      settlementId: input.settlementId,
      method: input.method,
      note: input.note,
      status: "pending",
      initiatedByUserId,
      idempotencyKey: input.idempotencyKey.trim(),
      createdAt: now,
    };
    this.onBehalf.set(row.id, row);
    return Promise.resolve(row);
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
  ): Promise<StoredOnBehalfPayment> {
    const row = this.onBehalf.get(onBehalfId);
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error("ON_BEHALF_NOT_FOUND");
    }
    if (row.status !== "pending") {
      throw new Error("ON_BEHALF_ALREADY_REVIEWED");
    }
    const now = new Date().toISOString();
    const next: StoredOnBehalfPayment = {
      ...row,
      status: update.status,
      approvedByUserId: update.approvedByUserId,
      approvedAt: now,
      rejectNote: update.rejectNote,
      journalEntryId: update.journalEntryId,
    };
    this.onBehalf.set(onBehalfId, next);
    return Promise.resolve(next);
  }
}
