import type { AppDatabase } from "@dang/db";
import type {
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  ResolveInvoiceDisputeRequest,
} from "@dang/contracts";

/** Outcome of one live recalculation pass for a period. */
export type InvoiceRecalcResult = {
  /** Draft invoices rewritten (or created) in this pass. */
  updated: MemberInvoiceSummary[];
  /** Correction notices raised because the member's invoice was locked. */
  adjustments: MemberInvoiceAdjustmentSummary[];
  /** Members whose figures were already up to date. */
  unchangedMemberUserIds: string[];
};

export type BillingStore = {
  readonly persistence: "memory" | "postgres";
  /** Present on Postgres so invoices can join the expense/ledger transaction. */
  readonly db?: AppDatabase;
  createPeriod(
    actorUserId: string,
    input: CreateExpensePeriodRequest,
    options?: { tx?: AppDatabase },
  ): Promise<ExpensePeriodSummary>;
  listPeriods(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary[]>;
  getPeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary | null>;
  /**
   * Period covering `isoDate`, opening a Jalali-month period when none exists.
   * Runs with member privileges so every expense can land in a real period.
   */
  ensureAutoPeriod(
    workspaceId: string,
    actorUserId: string,
    isoDate: string,
    options?: { tx?: AppDatabase },
  ): Promise<ExpensePeriodSummary>;
  /** Opens the next cadence period for auto-rollover periods that already ended. */
  rolloverDuePeriods(
    workspaceId: string,
    actorUserId: string,
    today: string,
  ): Promise<ExpensePeriodSummary[]>;
  generateInvoices(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]>;
  /**
   * Rewrites the live draft invoices of the given members from committed
   * expenses. Locked documents are never touched; their delta becomes an
   * adjustment notice instead.
   */
  recalculateMemberInvoices(
    input: {
      workspaceId: string;
      periodId: string;
      actorUserId: string;
      memberUserIds: readonly string[];
      reason: string;
    },
    options?: { tx?: AppDatabase },
  ): Promise<InvoiceRecalcResult>;
  listAdjustments(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceAdjustmentSummary[]>;
  listInvoices(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary[]>;
  listPendingApprovals(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary[]>;
  approveInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary>;
  disputeInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
    note?: string,
  ): Promise<MemberInvoiceSummary>;
  /**
   * Finance's answer to a dispute: accepted → back to draft for a rebuild,
   * rejected → back to issued and awaiting payment. Without this the disputed
   * state has no exit and the member's objection can never be settled.
   */
  resolveInvoiceDispute(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
    input: ResolveInvoiceDisputeRequest,
  ): Promise<MemberInvoiceSummary>;
  issueInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary>;
  markInvoicePaid(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary>;
  closePeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options?: { requireAllPaid?: boolean },
  ): Promise<ExpensePeriodSummary>;
  cancelPeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary>;
};

export const BILLING_STORE = Symbol("BILLING_STORE");
