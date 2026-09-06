import type {
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  MemberInvoiceSummary,
} from "@dang/contracts";

export type BillingStore = {
  readonly persistence: "memory" | "postgres";
  createPeriod(
    actorUserId: string,
    input: CreateExpensePeriodRequest,
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
  generateInvoices(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]>;
  listInvoices(
    workspaceId: string,
    periodId: string,
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
