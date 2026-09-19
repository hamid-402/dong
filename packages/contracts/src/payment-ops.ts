import type { Money } from "./money.js";
import type { ExpenseSplitLine, ExpenseSummary } from "./finance.js";

/**
 * S11-09 payment ops — receipts, petty cash, credit purchases.
 * Card custody: only dest holder name + last 4 digits; never full PAN.
 */

export type PaymentReceiptMethod =
  | "card_to_card"
  | "cash"
  | "bank_transfer"
  | "gateway";

export type PaymentReceiptStatus = "submitted" | "approved" | "rejected";

export type PaymentReceiptSummary = {
  id: string;
  workspaceId: string;
  settlementId?: string;
  memberInvoiceId?: string;
  payerUserId: string;
  method: PaymentReceiptMethod;
  amount: Money;
  paidAt: string;
  referenceNo?: string;
  destHolderName?: string;
  /** Only last 4 digits of destination card/account. */
  destLast4?: string;
  attachmentId?: string;
  status: PaymentReceiptStatus;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNote?: string;
  journalEntryId?: string;
  createdAt: string;
};

export type CreatePaymentReceiptRequest = {
  settlementId?: string;
  memberInvoiceId?: string;
  method: PaymentReceiptMethod;
  amountMinor: string;
  paidAt: string;
  referenceNo?: string;
  destHolderName?: string;
  destLast4?: string;
  attachmentId?: string;
  idempotencyKey: string;
};

export type RejectPaymentReceiptRequest = {
  note: string;
};

export type PettyCashMovementKind = "topup" | "spend" | "return" | "adjust";

export type PettyCashMovementSummary = {
  id: string;
  fundId: string;
  kind: PettyCashMovementKind;
  amountMinor: string;
  expenseId?: string;
  settlementId?: string;
  actorUserId: string;
  occurredAt: string;
  note?: string;
  createdAt: string;
};

export type PettyCashFundSummary = {
  id: string;
  workspaceId: string;
  name: string;
  custodianUserId: string;
  openingBalanceMinor: string;
  /** Computed: opening + signed movements. */
  balanceMinor: string;
  currency: "IRR";
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  movements?: PettyCashMovementSummary[];
};

export type CreatePettyCashFundRequest = {
  name: string;
  custodianUserId?: string;
  openingBalanceMinor?: string;
  idempotencyKey: string;
};

export type CreatePettyCashMovementRequest = {
  kind: PettyCashMovementKind;
  amountMinor: string;
  expenseId?: string;
  settlementId?: string;
  note?: string;
  occurredAt?: string;
  idempotencyKey: string;
};

/**
 * شارژ تنخواه از سهم اعضا: یک خرج مشترک ثبت می‌شود (مانده اعضا)،
 * سپس حرکت `topup` صندوق را افزایش می‌دهد و به همان خرج لینک می‌شود.
 */
export type TopupPettyCashFromMembersRequest = {
  amountMinor: string;
  /** پیش‌فرض equal؛ shares از defaultShares اعضا اگر splitLines نیاید. */
  splitMethod?: "equal" | "amount" | "percent" | "shares";
  participantUserIds: string[];
  splitLines?: Array<{
    userId: string;
    amount?: { amountMinor: string; currency: "IRR" };
    percent?: string;
    shares?: number;
  }>;
  /** کسی که فعلاً پول را به صندوق گذاشته؛ پیش‌فرض = actor. */
  paidByUserId?: string;
  note?: string;
  occurredOn?: string;
  idempotencyKey: string;
};

export type TopupPettyCashFromMembersResponse = {
  fund: PettyCashFundSummary;
  expense: ExpenseSummary;
  movement: PettyCashMovementSummary;
  balanceMinor: string;
  splits: ExpenseSplitLine[];
};

/**
 * برداشت از تنخواه با سهم اعضا: خرج مشترک + حرکت spend لینک‌شده.
 * مانده صندوق کم می‌شود؛ سهم‌ها در دفتر اعضا ثبت می‌شوند.
 */
export type SpendPettyCashAsExpenseRequest = {
  amountMinor: string;
  splitMethod?: "equal" | "amount" | "percent" | "shares";
  participantUserIds: string[];
  splitLines?: Array<{
    userId: string;
    amount?: { amountMinor: string; currency: "IRR" };
    percent?: string;
    shares?: number;
  }>;
  /** ثبت‌کننده / نگهبان صندوق به‌عنوان پرداخت‌کننده؛ پیش‌فرض = actor. */
  paidByUserId?: string;
  title?: string;
  note?: string;
  occurredOn?: string;
  idempotencyKey: string;
};

export type SpendPettyCashAsExpenseResponse = {
  fund: PettyCashFundSummary;
  expense: ExpenseSummary;
  movement: PettyCashMovementSummary;
  balanceMinor: string;
  splits: ExpenseSplitLine[];
};

/** Live fund-health snapshot from real balances + movement counts. */
export type PettyCashHealthReport = {
  workspaceId: string;
  generatedAt: string;
  fundCount: number;
  activeFundCount: number;
  totalBalanceMinor: string;
  funds: Array<{
    id: string;
    name: string;
    active: boolean;
    balanceMinor: string;
    openingBalanceMinor: string;
    movementCount: number;
    lastMovementAt?: string;
    status: "ok" | "empty" | "inactive";
  }>;
};

export type CreditPurchaseStatus =
  | "open"
  | "partially_paid"
  | "paid"
  | "overdue";

export type CreditPurchasePaymentSummary = {
  id: string;
  creditPurchaseId: string;
  amountMinor: string;
  paidAt: string;
  sourceKind: string;
  sourceRefId?: string;
  actorUserId: string;
  receiptId?: string;
  createdAt: string;
};

export type CreditPurchaseSummary = {
  id: string;
  workspaceId: string;
  supplierRef: string;
  amount: Money;
  purchasedAt: string;
  dueDate: string;
  status: CreditPurchaseStatus;
  expenseId?: string;
  createdByUserId: string;
  note?: string;
  paidTotalMinor: string;
  remainingMinor: string;
  payments?: CreditPurchasePaymentSummary[];
  createdAt: string;
};

export type CreateCreditPurchaseRequest = {
  supplierRef: string;
  amountMinor: string;
  purchasedAt: string;
  dueDate: string;
  expenseId?: string;
  note?: string;
  idempotencyKey: string;
};

export type CreateCreditPurchasePaymentRequest = {
  amountMinor: string;
  sourceKind: string;
  sourceRefId?: string;
  receiptId?: string;
  paidAt?: string;
  idempotencyKey: string;
};

/** S11-09 deep — pay from another member's account / on-behalf. */
export type OnBehalfPaymentStatus = "pending" | "approved" | "rejected";

export type OnBehalfPaymentSummary = {
  id: string;
  workspaceId: string;
  debtorUserId: string;
  payerUserId: string;
  amount: Money;
  settlementId?: string;
  method: PaymentReceiptMethod;
  note?: string;
  status: OnBehalfPaymentStatus;
  initiatedByUserId: string;
  approvedByUserId?: string;
  approvedAt?: string;
  rejectNote?: string;
  journalEntryId?: string;
  createdAt: string;
  /** Multi-level tier progress (Phase 2.3); present when approve is still pending. */
  approvalsHave?: number;
  approvalsNeeded?: number;
  tierApprovalStatus?: "pending" | "complete" | "rejected";
};

export type CreateOnBehalfPaymentRequest = {
  debtorUserId: string;
  payerUserId: string;
  amountMinor: string;
  settlementId?: string;
  method: PaymentReceiptMethod;
  note?: string;
  idempotencyKey: string;
};

export type RejectOnBehalfPaymentRequest = {
  note: string;
};

export function signedPettyCashDelta(
  kind: PettyCashMovementKind,
  amountMinor: string,
): bigint {
  const raw = BigInt(amountMinor);
  if (kind === "spend") return raw > 0n ? -raw : raw;
  if (kind === "adjust") return raw;
  return raw < 0n ? -raw : raw; // topup | return always increase
}
