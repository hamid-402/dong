import type { Money } from "./money.js";

/**
 * Invoice golden invariant (Dong 2.0 §۴.۳):
 * `total = sharedTotal + privateTotal` (privateTotal stands for personal add-ons
 * until the dedicated addon entity is fully wired).
 */
export function isInvoiceTotalConsistent(invoice: {
  sharedTotal: Money;
  privateTotal: Money;
  total: Money;
}): boolean {
  if (
    invoice.sharedTotal.currency !== invoice.privateTotal.currency ||
    invoice.sharedTotal.currency !== invoice.total.currency
  ) {
    return false;
  }
  const shared = BigInt(invoice.sharedTotal.amountMinor);
  const priv = BigInt(invoice.privateTotal.amountMinor);
  const total = BigInt(invoice.total.amountMinor);
  return shared + priv === total;
}

export function assertInvoiceTotalConsistent(invoice: {
  sharedTotal: Money;
  privateTotal: Money;
  total: Money;
}): void {
  if (!isInvoiceTotalConsistent(invoice)) {
    throw new Error("INVOICE_TOTAL_INVARIANT");
  }
}

export type PeriodKind = "day" | "week" | "month" | "year" | "custom";
export type PeriodStatus = "open" | "review" | "closed" | "cancelled";
export type ExpenseVisibility = "shared" | "private" | "company";

/** Aliases for product UX: collective=shared, personal=private, company ops. */
export type ExpenseKind = "collective" | "personal" | "company";

export function expenseKindFromVisibility(visibility: ExpenseVisibility): ExpenseKind {
  if (visibility === "private") return "personal";
  if (visibility === "company") return "company";
  return "collective";
}

export function visibilityFromExpenseKind(kind: ExpenseKind): ExpenseVisibility {
  if (kind === "personal") return "private";
  if (kind === "company") return "company";
  return "shared";
}
export type InvoiceStatus =
  | "draft"
  | "pending_approval"
  | "disputed"
  | "approved"
  | "issued"
  | "paid"
  | "cancelled";

/** How the period was opened: by hand, or rolled by the Jalali month cadence. */
export type PeriodCadence = "manual" | "jalali_month";

export type ExpensePeriodSummary = {
  id: string;
  workspaceId: string;
  title: string;
  kind: PeriodKind;
  status: PeriodStatus;
  startsOn: string;
  endsOn: string;
  note?: string;
  cadence: PeriodCadence;
  autoRollover: boolean;
  createdByUserId: string;
  createdAt: string;
};

export type CreateExpensePeriodRequest = {
  workspaceId: string;
  title: string;
  kind: PeriodKind;
  startsOn: string;
  endsOn: string;
  note?: string;
  cadence?: PeriodCadence;
  autoRollover?: boolean;
  idempotencyKey: string;
};

export type MemberInvoiceLineSummary = {
  id: string;
  expenseId: string;
  visibility: ExpenseVisibility;
  title: string;
  amount: Money;
  lineNo: number;
  /**
   * The day the money was actually spent. A line dated before the period began
   * is a prior-period item — it reached the books late, after its own month was
   * closed — and the document has to disclose that rather than silently absorb
   * it into the current total.
   */
  occurredOn?: string;
};

export type MemberInvoiceSummary = {
  id: string;
  workspaceId: string;
  periodId: string;
  memberUserId: string;
  status: InvoiceStatus;
  sharedTotal: Money;
  privateTotal: Money;
  total: Money;
  disputeNote?: string;
  issuedAt?: string;
  paidAt?: string;
  lines: MemberInvoiceLineSummary[];
  createdAt: string;
  /** Bumped on every live recalculation (1 = first build). */
  version?: number;
  /** Last time the live projection rewrote this draft. */
  recalculatedAt?: string;
  /** Committed amounts not yet posted; reported outside `total` on purpose. */
  pendingTotal?: Money;
};

export type GeneratePeriodInvoicesRequest = {
  /** When true, send drafts for member approval instead of keeping them as draft. */
  sendForApproval?: boolean;
};

/**
 * Answer to a member's objection. `accepted` sends the document back to draft so
 * the live projection rebuilds it from the expenses; `rejected` returns it to
 * issued, unchanged, and awaiting payment. Either way the argument is on record
 * instead of the invoice sitting in a state nothing can leave.
 */
export type ResolveInvoiceDisputeRequest = {
  outcome: "accepted" | "rejected";
  note?: string;
};

export type CloseExpensePeriodRequest = {
  /** When true, require all invoices to be paid before closing. */
  requireAllPaid?: boolean;
};
