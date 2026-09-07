import type {
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  ExpenseSummary,
  GeneratePeriodInvoicesRequest,
  InvoiceStatus,
  MemberInvoiceLineSummary,
  MemberInvoiceSummary,
  Money,
} from "@dang/contracts";
import { assertInvoiceTotalConsistent } from "@dang/contracts";
import type { ExpenseStore } from "../expenses/expense.types.js";
import type { BillingStore } from "./billing.types.js";

function irr(amountMinor: string | bigint): Money {
  return { amountMinor: amountMinor.toString(), currency: "IRR" };
}

function toPeriod(row: ExpensePeriodSummary): ExpensePeriodSummary {
  return row;
}

export class MemoryBillingStore implements BillingStore {
  readonly persistence = "memory" as const;
  private readonly periods = new Map<string, ExpensePeriodSummary & { idempotencyKey: string }>();
  private readonly invoices = new Map<string, MemberInvoiceSummary>();

  constructor(private readonly expenses: ExpenseStore) {}

  createPeriod(
    actorUserId: string,
    input: CreateExpensePeriodRequest,
  ): Promise<ExpensePeriodSummary> {
    const existing = [...this.periods.values()].find(
      (p) =>
        p.workspaceId === input.workspaceId &&
        p.idempotencyKey === input.idempotencyKey.trim(),
    );
    if (existing) return Promise.resolve(toPeriod(existing));

    const period: ExpensePeriodSummary & { idempotencyKey: string } = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      title: input.title.trim(),
      kind: input.kind,
      status: "open",
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      note: input.note?.trim() || undefined,
      createdByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    this.periods.set(period.id, period);
    return Promise.resolve(toPeriod(period));
  }

  listPeriods(
    workspaceId: string,
    _actorUserId: string,
  ): Promise<ExpensePeriodSummary[]> {
    void _actorUserId;
    return Promise.resolve(
      [...this.periods.values()]
        .filter((p) => p.workspaceId === workspaceId)
        .map(toPeriod)
        .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    );
  }

  getPeriod(
    workspaceId: string,
    periodId: string,
    _actorUserId: string,
  ): Promise<ExpensePeriodSummary | null> {
    void _actorUserId;
    const period = this.periods.get(periodId);
    if (!period || period.workspaceId !== workspaceId) return Promise.resolve(null);
    return Promise.resolve(toPeriod(period));
  }

  async generateInvoices(
    workspaceId: string,
    periodId: string,
    _actorUserId: string,
    options: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]> {
    const period = await this.getPeriod(workspaceId, periodId, _actorUserId);
    if (!period) throw new Error("PERIOD_NOT_FOUND");

    const expenses = (
      await this.expenses.listForWorkspace(workspaceId, _actorUserId, {
        viewAllPrivate: true,
      })
    ).filter(
      (e) => e.periodId === periodId && (e.status === "posted" || e.status === "submitted" || e.status === "draft"),
    );

    const byMember = new Map<
      string,
      { shared: bigint; privateAmt: bigint; lines: MemberInvoiceLineSummary[] }
    >();

    const ensure = (userId: string) => {
      let bucket = byMember.get(userId);
      if (!bucket) {
        bucket = { shared: 0n, privateAmt: 0n, lines: [] };
        byMember.set(userId, bucket);
      }
      return bucket;
    };

    for (const expense of expenses) {
      for (const split of expense.splits) {
        const amount = BigInt(split.amount.amountMinor);
        const bucket = ensure(split.userId);
        const visibility = expense.visibility ?? "shared";
        if (visibility === "private") bucket.privateAmt += amount;
        else bucket.shared += amount;
        bucket.lines.push({
          id: crypto.randomUUID(),
          expenseId: expense.id,
          visibility,
          title: expense.title,
          amount: irr(amount),
          lineNo: bucket.lines.length + 1,
        });
      }
    }

    // Replace only draft / pending invoices; keep approved|issued|paid|…
    const lockedMembers = new Set<string>();
    for (const [id, invoice] of this.invoices) {
      if (invoice.periodId !== periodId || invoice.workspaceId !== workspaceId) continue;
      if (invoice.status === "draft" || invoice.status === "pending_approval") {
        this.invoices.delete(id);
      } else {
        lockedMembers.add(invoice.memberUserId);
      }
    }

    const status: InvoiceStatus = options.sendForApproval
      ? "pending_approval"
      : "draft";
    const result: MemberInvoiceSummary[] = [];

    for (const [memberUserId, bucket] of byMember) {
      if (lockedMembers.has(memberUserId)) continue;
      const total = bucket.shared + bucket.privateAmt;
      if (total === 0n) continue;
      const invoice: MemberInvoiceSummary = {
        id: crypto.randomUUID(),
        workspaceId,
        periodId,
        memberUserId,
        status,
        sharedTotal: irr(bucket.shared),
        privateTotal: irr(bucket.privateAmt),
        total: irr(total),
        lines: bucket.lines,
        createdAt: new Date().toISOString(),
      };
      assertInvoiceTotalConsistent(invoice);
      this.invoices.set(invoice.id, invoice);
      result.push(invoice);
    }

    for (const invoice of this.invoices.values()) {
      if (
        invoice.workspaceId === workspaceId &&
        invoice.periodId === periodId &&
        lockedMembers.has(invoice.memberUserId)
      ) {
        result.push(invoice);
      }
    }

    return result;
  }

  listInvoices(
    workspaceId: string,
    periodId: string,
    _actorUserId: string,
  ): Promise<MemberInvoiceSummary[]> {
    void _actorUserId;
    return Promise.resolve(
      [...this.invoices.values()].filter(
        (i) => i.workspaceId === workspaceId && i.periodId === periodId,
      ),
    );
  }

  listPendingApprovals(
    workspaceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary[]> {
    return Promise.resolve(
      [...this.invoices.values()].filter(
        (invoice) =>
          invoice.workspaceId === workspaceId &&
          invoice.memberUserId === actorUserId &&
          invoice.status === "pending_approval",
      ),
    );
  }

  approveInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return Promise.reject(new Error("INVOICE_NOT_FOUND"));
    }
    if (invoice.memberUserId !== actorUserId) {
      return Promise.reject(new Error("INVOICE_FORBIDDEN"));
    }
    if (invoice.status !== "pending_approval" && invoice.status !== "draft") {
      return Promise.reject(new Error("INVOICE_STATUS"));
    }
    const updated = { ...invoice, status: "approved" as const, disputeNote: undefined };
    this.invoices.set(invoiceId, updated);
    return Promise.resolve(updated);
  }

  disputeInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
    note?: string,
  ): Promise<MemberInvoiceSummary> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return Promise.reject(new Error("INVOICE_NOT_FOUND"));
    }
    if (invoice.memberUserId !== actorUserId) {
      return Promise.reject(new Error("INVOICE_FORBIDDEN"));
    }
    if (invoice.status !== "pending_approval" && invoice.status !== "draft") {
      return Promise.reject(new Error("INVOICE_STATUS"));
    }
    const updated = {
      ...invoice,
      status: "disputed" as const,
      disputeNote: note?.trim() || undefined,
    };
    this.invoices.set(invoiceId, updated);
    return Promise.resolve(updated);
  }

  issueInvoice(
    workspaceId: string,
    invoiceId: string,
    _actorUserId: string,
  ): Promise<MemberInvoiceSummary> {
    void _actorUserId;
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return Promise.reject(new Error("INVOICE_NOT_FOUND"));
    }
    if (invoice.status !== "approved" && invoice.status !== "pending_approval" && invoice.status !== "draft") {
      return Promise.reject(new Error("INVOICE_STATUS"));
    }
    const updated = {
      ...invoice,
      status: "issued" as const,
      issuedAt: new Date().toISOString(),
    };
    this.invoices.set(invoiceId, updated);
    return Promise.resolve(updated);
  }

  markInvoicePaid(
    workspaceId: string,
    invoiceId: string,
    _actorUserId: string,
  ): Promise<MemberInvoiceSummary> {
    void _actorUserId;
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return Promise.reject(new Error("INVOICE_NOT_FOUND"));
    }
    if (invoice.status !== "issued") {
      return Promise.reject(new Error("INVOICE_STATUS"));
    }
    const updated = {
      ...invoice,
      status: "paid" as const,
      paidAt: new Date().toISOString(),
    };
    this.invoices.set(invoiceId, updated);
    return Promise.resolve(updated);
  }

  async closePeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options: { requireAllPaid?: boolean } = {},
  ): Promise<ExpensePeriodSummary> {
    const period = await this.getPeriod(workspaceId, periodId, actorUserId);
    if (!period) return Promise.reject(new Error("PERIOD_NOT_FOUND"));
    if (period.status !== "open" && period.status !== "review") {
      return Promise.reject(new Error("PERIOD_STATUS"));
    }
    if (options.requireAllPaid) {
      const invoices = await this.listInvoices(workspaceId, periodId, actorUserId);
      const hasUnpaid = invoices.some(
        (row) => row.status !== "paid" && row.status !== "cancelled",
      );
      if (hasUnpaid) return Promise.reject(new Error("PERIOD_INVOICES_UNPAID"));
    }
    const stored = this.periods.get(periodId);
    if (!stored) return Promise.reject(new Error("PERIOD_NOT_FOUND"));
    const updated = { ...stored, status: "closed" as const };
    this.periods.set(periodId, updated);
    return updated;
  }

  async cancelPeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary> {
    const period = await this.getPeriod(workspaceId, periodId, actorUserId);
    if (!period) return Promise.reject(new Error("PERIOD_NOT_FOUND"));
    if (period.status !== "open") return Promise.reject(new Error("PERIOD_STATUS"));
    const stored = this.periods.get(periodId);
    if (!stored) return Promise.reject(new Error("PERIOD_NOT_FOUND"));
    const updated = { ...stored, status: "cancelled" as const };
    this.periods.set(periodId, updated);
    return updated;
  }
}

/** Helper for tests / seed — attach expense summaries to memory billing. */
export type { ExpenseSummary };
