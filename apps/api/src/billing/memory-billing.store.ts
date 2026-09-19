import type {
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  ExpenseSummary,
  GeneratePeriodInvoicesRequest,
  InvoiceStatus,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  Money,
  ResolveInvoiceDisputeRequest,
} from "@dang/contracts";
import {
  aggregateMemberInvoiceBuckets,
  assertInvoiceTotalConsistent,
  autoPeriodIdempotencyKey,
  invoiceCommittedHash,
  invoiceSourceHash,
  isInvoiceLocked,
  nextJalaliMonthPeriod,
  pickPeriodForDate,
  planAutoPeriod,
  toMemberInvoiceLines,
} from "@dang/contracts";
import type { ExpenseStore } from "../expenses/expense.types.js";
import type { BillingStore, InvoiceRecalcResult } from "./billing.types.js";

function irr(amountMinor: string | bigint): Money {
  return { amountMinor: amountMinor.toString(), currency: "IRR" };
}

function toPeriod(row: ExpensePeriodSummary): ExpensePeriodSummary {
  return row;
}

type StoredInvoice = MemberInvoiceSummary & { sourceHash?: string };

export class MemoryBillingStore implements BillingStore {
  readonly persistence = "memory" as const;
  private readonly periods = new Map<string, ExpensePeriodSummary & { idempotencyKey: string }>();
  private readonly invoices = new Map<string, StoredInvoice>();
  private readonly adjustments = new Map<string, MemberInvoiceAdjustmentSummary>();

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
      cadence: input.cadence ?? "manual",
      autoRollover: input.autoRollover ?? false,
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

  async ensureAutoPeriod(
    workspaceId: string,
    actorUserId: string,
    isoDate: string,
  ): Promise<ExpensePeriodSummary> {
    const plan = planAutoPeriod(
      await this.listPeriods(workspaceId, actorUserId),
      isoDate,
      new Date().toISOString().slice(0, 10),
    );
    if (plan.kind === "existing") return plan.period;
    return this.createPeriod(actorUserId, {
      workspaceId,
      title: plan.range.title,
      kind: plan.range.kind,
      startsOn: plan.range.startsOn,
      endsOn: plan.range.endsOn,
      cadence: plan.range.cadence,
      autoRollover: true,
      idempotencyKey: plan.idempotencyKey,
    });
  }

  async rolloverDuePeriods(
    workspaceId: string,
    actorUserId: string,
    today: string,
  ): Promise<ExpensePeriodSummary[]> {
    const periods = await this.listPeriods(workspaceId, actorUserId);
    const due = periods.filter(
      (period) =>
        period.autoRollover &&
        period.cadence === "jalali_month" &&
        period.endsOn < today,
    );
    const opened: ExpensePeriodSummary[] = [];
    for (const period of due) {
      const range = nextJalaliMonthPeriod(period.endsOn);
      const covered = pickPeriodForDate(
        await this.listPeriods(workspaceId, actorUserId),
        range.startsOn,
      );
      if (covered) continue;
      opened.push(
        await this.createPeriod(actorUserId, {
          workspaceId,
          title: range.title,
          kind: range.kind,
          startsOn: range.startsOn,
          endsOn: range.endsOn,
          cadence: range.cadence,
          autoRollover: true,
          idempotencyKey: autoPeriodIdempotencyKey(range),
        }),
      );
    }
    return opened;
  }

  async generateInvoices(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]> {
    const period = await this.getPeriod(workspaceId, periodId, actorUserId);
    if (!period) throw new Error("PERIOD_NOT_FOUND");

    const buckets = aggregateMemberInvoiceBuckets(
      await this.periodExpenses(workspaceId, periodId, actorUserId),
    );
    const status: InvoiceStatus = options.sendForApproval
      ? "pending_approval"
      : "draft";

    for (const bucket of buckets) {
      const locked = this.findInvoice(workspaceId, periodId, bucket.memberUserId);
      if (locked && isInvoiceLocked(locked.status)) continue;
      // No commitment, no document: pending amounts alone never open an invoice.
      if (bucket.totalMinor === 0n) {
        if (locked) this.invoices.delete(locked.id);
        continue;
      }
      this.writeInvoice(workspaceId, periodId, bucket, status);
    }

    // Same period transition Postgres performs, so both backends read alike.
    const stored = this.periods.get(periodId);
    if (stored && (stored.status === "open" || stored.status === "review")) {
      this.periods.set(periodId, {
        ...stored,
        status: options.sendForApproval ? "review" : stored.status,
      });
    }

    return this.listInvoices(workspaceId, periodId, actorUserId);
  }

  async recalculateMemberInvoices(
    input: {
      workspaceId: string;
      periodId: string;
      actorUserId: string;
      memberUserIds: readonly string[];
      reason: string;
    },
  ): Promise<InvoiceRecalcResult> {
    const { workspaceId, periodId, actorUserId, memberUserIds, reason } = input;
    const period = await this.getPeriod(workspaceId, periodId, actorUserId);
    if (!period) throw new Error("PERIOD_NOT_FOUND");

    const buckets = aggregateMemberInvoiceBuckets(
      await this.periodExpenses(workspaceId, periodId, actorUserId),
      { memberUserIds },
    );

    const result: InvoiceRecalcResult = {
      updated: [],
      adjustments: [],
      unchangedMemberUserIds: [],
    };

    for (const bucket of buckets) {
      const current = this.findInvoice(workspaceId, periodId, bucket.memberUserId);
      const hash = invoiceSourceHash(bucket);

      if (current && isInvoiceLocked(current.status)) {
        const delta =
          bucket.totalMinor - BigInt(current.total.amountMinor);
        if (delta === 0n) {
          result.unchangedMemberUserIds.push(bucket.memberUserId);
          continue;
        }
        // Keyed on committed substance only: a new draft must not mint a notice.
        const key = `adj:${current.id}:${invoiceCommittedHash(bucket)}`;
        const existing = [...this.adjustments.values()].find(
          (row) => row.invoiceId === current.id && row.reason === reason && row.id === key,
        );
        if (existing) {
          result.adjustments.push(existing);
          continue;
        }
        const adjustment: MemberInvoiceAdjustmentSummary = {
          id: key,
          workspaceId,
          periodId,
          invoiceId: current.id,
          memberUserId: bucket.memberUserId,
          delta: irr(delta),
          reason,
          createdAt: new Date().toISOString(),
        };
        this.adjustments.set(adjustment.id, adjustment);
        result.adjustments.push(adjustment);
        continue;
      }

      // Pending amounts ride along on an existing document; they never open one.
      if (bucket.totalMinor === 0n) {
        if (current) this.invoices.delete(current.id);
        result.unchangedMemberUserIds.push(bucket.memberUserId);
        continue;
      }

      if (current && current.sourceHash === hash) {
        result.unchangedMemberUserIds.push(bucket.memberUserId);
        continue;
      }

      result.updated.push(
        this.writeInvoice(
          workspaceId,
          periodId,
          bucket,
          current?.status ?? "draft",
          hash,
        ),
      );
    }

    return result;
  }

  listAdjustments(
    workspaceId: string,
    periodId: string,
    _actorUserId: string,
  ): Promise<MemberInvoiceAdjustmentSummary[]> {
    void _actorUserId;
    return Promise.resolve(
      [...this.adjustments.values()]
        .filter(
          (row) => row.workspaceId === workspaceId && row.periodId === periodId,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
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

  resolveInvoiceDispute(
    workspaceId: string,
    invoiceId: string,
    _actorUserId: string,
    input: ResolveInvoiceDisputeRequest,
  ): Promise<MemberInvoiceSummary> {
    void _actorUserId;
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return Promise.reject(new Error("INVOICE_NOT_FOUND"));
    }
    if (invoice.status !== "disputed") {
      return Promise.reject(new Error("INVOICE_STATUS"));
    }
    const updated = {
      ...invoice,
      // Accepted: the figures are in question, so the document goes back to the
      // live projection. Rejected: it stands exactly as issued.
      status: input.outcome === "accepted" ? ("draft" as const) : ("issued" as const),
      disputeNote: undefined,
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

  private async periodExpenses(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<ExpenseSummary[]> {
    const all = await this.expenses.listForWorkspace(workspaceId, actorUserId, {
      viewAllPrivate: true,
    });
    return all.filter((e) => e.periodId === periodId);
  }

  private findInvoice(
    workspaceId: string,
    periodId: string,
    memberUserId: string,
  ): StoredInvoice | undefined {
    return [...this.invoices.values()].find(
      (invoice) =>
        invoice.workspaceId === workspaceId &&
        invoice.periodId === periodId &&
        invoice.memberUserId === memberUserId,
    );
  }

  private writeInvoice(
    workspaceId: string,
    periodId: string,
    bucket: ReturnType<typeof aggregateMemberInvoiceBuckets>[number],
    status: InvoiceStatus,
    sourceHash?: string,
  ): MemberInvoiceSummary {
    const current = this.findInvoice(workspaceId, periodId, bucket.memberUserId);
    const invoice: StoredInvoice = {
      id: current?.id ?? crypto.randomUUID(),
      workspaceId,
      periodId,
      memberUserId: bucket.memberUserId,
      status,
      sharedTotal: irr(bucket.sharedMinor),
      privateTotal: irr(bucket.privateMinor),
      total: irr(bucket.totalMinor),
      pendingTotal: irr(bucket.pendingMinor),
      lines: toMemberInvoiceLines(bucket, () => crypto.randomUUID()),
      createdAt: current?.createdAt ?? new Date().toISOString(),
      version: (current?.version ?? 0) + 1,
      recalculatedAt: new Date().toISOString(),
      sourceHash: sourceHash ?? invoiceSourceHash(bucket),
    };
    assertInvoiceTotalConsistent(invoice);
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }
}

/** Helper for tests / seed — attach expense summaries to memory billing. */
export type { ExpenseSummary };
