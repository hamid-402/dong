import type {
  CreateCreditPurchasePaymentRequest,
  CreateCreditPurchaseRequest,
  CreateOnBehalfPaymentRequest,
  CreatePaymentReceiptRequest,
  CreatePettyCashFundRequest,
  CreatePettyCashMovementRequest,
  CreditPurchasePaymentSummary,
  CreditPurchaseStatus,
  CreditPurchaseSummary,
  OnBehalfPaymentStatus,
  OnBehalfPaymentSummary,
  PaymentReceiptStatus,
  PaymentReceiptSummary,
  PettyCashFundSummary,
  PettyCashMovementSummary,
} from "@dang/contracts";
import type { AppDatabase } from "@dang/db";

export type StoredPaymentReceipt = PaymentReceiptSummary & {
  idempotencyKey: string;
};

export type StoredPettyCashFund = {
  id: string;
  workspaceId: string;
  name: string;
  custodianUserId: string;
  openingBalanceMinor: string;
  currency: "IRR";
  active: boolean;
  createdByUserId: string;
  idempotencyKey: string;
  createdAt: string;
};

export type StoredPettyCashMovement = PettyCashMovementSummary & {
  idempotencyKey: string;
};

export type StoredCreditPurchase = {
  id: string;
  workspaceId: string;
  supplierRef: string;
  amountMinor: string;
  currency: "IRR";
  purchasedAt: string;
  dueDate: string;
  status: CreditPurchaseStatus;
  expenseId?: string;
  createdByUserId: string;
  note?: string;
  idempotencyKey: string;
  createdAt: string;
};

export type StoredCreditPurchasePayment = CreditPurchasePaymentSummary & {
  idempotencyKey: string;
};

export type StoredOnBehalfPayment = OnBehalfPaymentSummary & {
  idempotencyKey: string;
};

export type PaymentOpsWriteOptions = {
  tx?: AppDatabase;
};

export type PaymentOpsStore = {
  readonly persistence: "memory" | "postgres";
  readonly db?: AppDatabase;

  listReceipts(
    workspaceId: string,
    status?: PaymentReceiptStatus,
  ): Promise<StoredPaymentReceipt[]>;
  getReceipt(
    workspaceId: string,
    receiptId: string,
  ): Promise<StoredPaymentReceipt | null>;
  createReceipt(
    workspaceId: string,
    payerUserId: string,
    input: CreatePaymentReceiptRequest,
  ): Promise<StoredPaymentReceipt>;
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
  ): Promise<StoredPaymentReceipt>;

  listFunds(workspaceId: string): Promise<StoredPettyCashFund[]>;
  getFund(
    workspaceId: string,
    fundId: string,
  ): Promise<StoredPettyCashFund | null>;
  createFund(
    workspaceId: string,
    createdByUserId: string,
    input: CreatePettyCashFundRequest & { custodianUserId: string },
  ): Promise<StoredPettyCashFund>;
  /** Soft-close / reopen — never hard-delete; ledger history stays. */
  setFundActive(
    workspaceId: string,
    fundId: string,
    active: boolean,
  ): Promise<StoredPettyCashFund>;
  /** Requires workspaceId so Postgres RLS (FORCE) can see fund-scoped rows. */
  listMovements(
    workspaceId: string,
    fundId: string,
  ): Promise<StoredPettyCashMovement[]>;
  createMovement(
    workspaceId: string,
    fundId: string,
    actorUserId: string,
    input: CreatePettyCashMovementRequest & { occurredAt: string },
  ): Promise<StoredPettyCashMovement>;

  listCreditPurchases(
    workspaceId: string,
    status?: CreditPurchaseStatus,
  ): Promise<StoredCreditPurchase[]>;
  getCreditPurchase(
    workspaceId: string,
    purchaseId: string,
  ): Promise<StoredCreditPurchase | null>;
  createCreditPurchase(
    workspaceId: string,
    createdByUserId: string,
    input: CreateCreditPurchaseRequest,
  ): Promise<StoredCreditPurchase>;
  listCreditPayments(
    purchaseId: string,
  ): Promise<StoredCreditPurchasePayment[]>;
  createCreditPayment(
    purchaseId: string,
    actorUserId: string,
    input: CreateCreditPurchasePaymentRequest & { paidAt: string },
  ): Promise<StoredCreditPurchasePayment>;
  updateCreditPurchaseStatus(
    workspaceId: string,
    purchaseId: string,
    status: CreditPurchaseStatus,
  ): Promise<StoredCreditPurchase>;

  listOnBehalf(
    workspaceId: string,
    status?: OnBehalfPaymentStatus,
  ): Promise<StoredOnBehalfPayment[]>;
  getOnBehalf(
    workspaceId: string,
    onBehalfId: string,
  ): Promise<StoredOnBehalfPayment | null>;
  createOnBehalf(
    workspaceId: string,
    initiatedByUserId: string,
    input: CreateOnBehalfPaymentRequest,
  ): Promise<StoredOnBehalfPayment>;
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
  ): Promise<StoredOnBehalfPayment>;
};

export const PAYMENT_OPS_STORE = Symbol("PAYMENT_OPS_STORE");

export function toReceiptSummary(row: StoredPaymentReceipt): PaymentReceiptSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    settlementId: row.settlementId,
    memberInvoiceId: row.memberInvoiceId,
    payerUserId: row.payerUserId,
    method: row.method,
    amount: row.amount,
    paidAt: row.paidAt,
    referenceNo: row.referenceNo,
    destHolderName: row.destHolderName,
    destLast4: row.destLast4,
    attachmentId: row.attachmentId,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    journalEntryId: row.journalEntryId,
    createdAt: row.createdAt,
  };
}

export function toOnBehalfSummary(row: StoredOnBehalfPayment): OnBehalfPaymentSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    debtorUserId: row.debtorUserId,
    payerUserId: row.payerUserId,
    amount: row.amount,
    settlementId: row.settlementId,
    method: row.method,
    note: row.note,
    status: row.status,
    initiatedByUserId: row.initiatedByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    rejectNote: row.rejectNote,
    journalEntryId: row.journalEntryId,
    createdAt: row.createdAt,
  };
}

export function toFundSummary(
  fund: StoredPettyCashFund,
  balanceMinor: string,
  movements?: PettyCashMovementSummary[],
): PettyCashFundSummary {
  return {
    id: fund.id,
    workspaceId: fund.workspaceId,
    name: fund.name,
    custodianUserId: fund.custodianUserId,
    openingBalanceMinor: fund.openingBalanceMinor,
    balanceMinor,
    currency: "IRR",
    active: fund.active,
    createdByUserId: fund.createdByUserId,
    createdAt: fund.createdAt,
    movements,
  };
}

export function toCreditSummary(
  purchase: StoredCreditPurchase,
  payments: StoredCreditPurchasePayment[],
): CreditPurchaseSummary {
  const paidTotal = payments.reduce((s, p) => s + BigInt(p.amountMinor), 0n);
  const total = BigInt(purchase.amountMinor);
  const remaining = total - paidTotal;
  return {
    id: purchase.id,
    workspaceId: purchase.workspaceId,
    supplierRef: purchase.supplierRef,
    amount: { amountMinor: purchase.amountMinor, currency: "IRR" },
    purchasedAt: purchase.purchasedAt,
    dueDate: purchase.dueDate,
    status: purchase.status,
    expenseId: purchase.expenseId,
    createdByUserId: purchase.createdByUserId,
    note: purchase.note,
    paidTotalMinor: paidTotal.toString(),
    remainingMinor: remaining.toString(),
    payments: payments.map((p) => ({
      id: p.id,
      creditPurchaseId: p.creditPurchaseId,
      amountMinor: p.amountMinor,
      paidAt: p.paidAt,
      sourceKind: p.sourceKind,
      sourceRefId: p.sourceRefId,
      actorUserId: p.actorUserId,
      receiptId: p.receiptId,
      createdAt: p.createdAt,
    })),
    createdAt: purchase.createdAt,
  };
}
