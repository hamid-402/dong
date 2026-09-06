import type { Money } from "./money.js";

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

export type ExpensePeriodSummary = {
  id: string;
  workspaceId: string;
  title: string;
  kind: PeriodKind;
  status: PeriodStatus;
  startsOn: string;
  endsOn: string;
  note?: string;
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
  idempotencyKey: string;
};

export type MemberInvoiceLineSummary = {
  id: string;
  expenseId: string;
  visibility: ExpenseVisibility;
  title: string;
  amount: Money;
  lineNo: number;
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
};

export type GeneratePeriodInvoicesRequest = {
  /** When true, send drafts for member approval instead of keeping them as draft. */
  sendForApproval?: boolean;
};

export type CloseExpensePeriodRequest = {
  /** When true, require all invoices to be paid before closing. */
  requireAllPaid?: boolean;
};
