import {
  and,
  createDatabase,
  eq,
  expense,
  expensePeriod,
  expenseSplitLine,
  memberInvoice,
  memberInvoiceLine,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  InvoiceStatus,
  MemberInvoiceSummary,
  Money,
} from "@dang/contracts";
import type { BillingStore } from "./billing.types.js";

function irr(amountMinor: string | bigint): Money {
  return { amountMinor: amountMinor.toString(), currency: "IRR" };
}

function formatDate(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function mapPeriod(row: typeof expensePeriod.$inferSelect): ExpensePeriodSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    kind: row.kind,
    status: row.status,
    startsOn: formatDate(row.startsOn),
    endsOn: formatDate(row.endsOn),
    note: row.note ?? undefined,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresBillingStore implements BillingStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresBillingStore {
    const { db } = createDatabase(connectionString);
    return new PostgresBillingStore(db);
  }

  async createPeriod(
    actorUserId: string,
    input: CreateExpensePeriodRequest,
  ): Promise<ExpensePeriodSummary> {
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(expensePeriod)
          .where(
            and(
              eq(expensePeriod.workspaceId, input.workspaceId),
              eq(expensePeriod.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapPeriod(existing[0]);

        const inserted = await tx
          .insert(expensePeriod)
          .values({
            workspaceId: input.workspaceId,
            title: input.title.trim(),
            kind: input.kind,
            status: "open",
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            note: input.note?.trim() || null,
            idempotencyKey: input.idempotencyKey.trim(),
            createdByUserId: actorUserId,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("PERIOD_INSERT_FAILED");
        return mapPeriod(row);
      },
    );
  }

  async listPeriods(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(expensePeriod)
          .where(eq(expensePeriod.workspaceId, workspaceId));
        return rows
          .map(mapPeriod)
          .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
      },
    );
  }

  async getPeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(expensePeriod)
          .where(
            and(
              eq(expensePeriod.id, periodId),
              eq(expensePeriod.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        return rows[0] ? mapPeriod(rows[0]) : null;
      },
    );
  }

  async generateInvoices(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const periods = await tx
          .select()
          .from(expensePeriod)
          .where(
            and(
              eq(expensePeriod.id, periodId),
              eq(expensePeriod.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        if (!periods[0]) throw new Error("PERIOD_NOT_FOUND");

        const expenses = await tx
          .select()
          .from(expense)
          .where(
            and(eq(expense.workspaceId, workspaceId), eq(expense.periodId, periodId)),
          );
        const billable = expenses.filter(
          (e) =>
            e.status === "posted" ||
            e.status === "submitted" ||
            e.status === "draft",
        );

        const byMember = new Map<
          string,
          {
            shared: bigint;
            privateAmt: bigint;
            lines: Array<{
              expenseId: string;
              visibility: "shared" | "private" | "company";
              title: string;
              amountMinor: bigint;
            }>;
          }
        >();

        for (const exp of billable) {
          const splits = await tx
            .select()
            .from(expenseSplitLine)
            .where(eq(expenseSplitLine.expenseId, exp.id));
          for (const split of splits) {
            let bucket = byMember.get(split.userId);
            if (!bucket) {
              bucket = { shared: 0n, privateAmt: 0n, lines: [] };
              byMember.set(split.userId, bucket);
            }
            const visibility = exp.visibility ?? "shared";
            if (visibility === "private") bucket.privateAmt += split.amountMinor;
            else bucket.shared += split.amountMinor;
            bucket.lines.push({
              expenseId: exp.id,
              visibility,
              title: exp.title,
              amountMinor: split.amountMinor,
            });
          }
        }

        const oldInvoices = await tx
          .select()
          .from(memberInvoice)
          .where(
            and(
              eq(memberInvoice.workspaceId, workspaceId),
              eq(memberInvoice.periodId, periodId),
            ),
          );
        const lockedMembers = new Set<string>();
        for (const old of oldInvoices) {
          if (old.status === "draft" || old.status === "pending_approval") {
            await tx.delete(memberInvoice).where(eq(memberInvoice.id, old.id));
          } else {
            lockedMembers.add(old.memberUserId);
          }
        }

        const status: InvoiceStatus = options.sendForApproval
          ? "pending_approval"
          : "draft";

        for (const [memberUserId, bucket] of byMember) {
          if (lockedMembers.has(memberUserId)) continue;
          const total = bucket.shared + bucket.privateAmt;
          if (total === 0n) continue;
          const idempotencyKey = `period:${periodId}:member:${memberUserId}`;
          const inserted = await tx
            .insert(memberInvoice)
            .values({
              workspaceId,
              periodId,
              memberUserId,
              status,
              sharedTotalMinor: bucket.shared,
              privateTotalMinor: bucket.privateAmt,
              totalMinor: total,
              idempotencyKey,
            })
            .returning();
          const row = inserted[0];
          if (!row) continue;

          if (bucket.lines.length) {
            await tx.insert(memberInvoiceLine).values(
              bucket.lines.map((line, index) => ({
                invoiceId: row.id,
                workspaceId,
                expenseId: line.expenseId,
                visibility: line.visibility,
                title: line.title,
                amountMinor: line.amountMinor,
                lineNo: index + 1,
              })),
            );
          }
        }

        await tx
          .update(expensePeriod)
          .set({ status: options.sendForApproval ? "review" : "open" })
          .where(eq(expensePeriod.id, periodId));

        const remaining = await tx
          .select()
          .from(memberInvoice)
          .where(
            and(
              eq(memberInvoice.workspaceId, workspaceId),
              eq(memberInvoice.periodId, periodId),
            ),
          );
        const out: MemberInvoiceSummary[] = [];
        for (const row of remaining) {
          out.push(await this.loadInvoice(tx, row.id, workspaceId));
        }
        return out;
      },
    );
  }

  async listInvoices(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(memberInvoice)
          .where(
            and(
              eq(memberInvoice.workspaceId, workspaceId),
              eq(memberInvoice.periodId, periodId),
            ),
          );
        const out: MemberInvoiceSummary[] = [];
        for (const row of rows) {
          out.push(await this.loadInvoice(tx, row.id, workspaceId));
        }
        return out;
      },
    );
  }

  async approveInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary> {
    return this.transitionInvoice(workspaceId, invoiceId, actorUserId, "approved", {
      requireOwner: true,
      from: ["draft", "pending_approval"],
    });
  }

  async disputeInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
    note?: string,
  ): Promise<MemberInvoiceSummary> {
    return this.transitionInvoice(workspaceId, invoiceId, actorUserId, "disputed", {
      requireOwner: true,
      from: ["draft", "pending_approval"],
      disputeNote: note,
    });
  }

  async issueInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary> {
    return this.transitionInvoice(workspaceId, invoiceId, actorUserId, "issued", {
      requireOwner: false,
      from: ["approved", "pending_approval", "draft"],
      issuedAt: true,
    });
  }

  async markInvoicePaid(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceSummary> {
    return this.transitionInvoice(workspaceId, invoiceId, actorUserId, "paid", {
      requireOwner: false,
      from: ["issued"],
      paidAt: true,
    });
  }

  async closePeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
    options: { requireAllPaid?: boolean } = {},
  ): Promise<ExpensePeriodSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const periods = await tx
          .select()
          .from(expensePeriod)
          .where(
            and(
              eq(expensePeriod.id, periodId),
              eq(expensePeriod.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        const period = periods[0];
        if (!period) throw new Error("PERIOD_NOT_FOUND");
        if (period.status !== "open" && period.status !== "review") {
          throw new Error("PERIOD_STATUS");
        }
        if (options.requireAllPaid) {
          const unpaid = await tx
            .select()
            .from(memberInvoice)
            .where(
              and(
                eq(memberInvoice.workspaceId, workspaceId),
                eq(memberInvoice.periodId, periodId),
              ),
            );
          const hasUnpaid = unpaid.some(
            (row) => row.status !== "paid" && row.status !== "cancelled",
          );
          if (hasUnpaid) throw new Error("PERIOD_INVOICES_UNPAID");
        }
        const updated = await tx
          .update(expensePeriod)
          .set({ status: "closed" })
          .where(eq(expensePeriod.id, periodId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("PERIOD_NOT_FOUND");
        return mapPeriod(row);
      },
    );
  }

  async cancelPeriod(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const periods = await tx
          .select()
          .from(expensePeriod)
          .where(
            and(
              eq(expensePeriod.id, periodId),
              eq(expensePeriod.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        const period = periods[0];
        if (!period) throw new Error("PERIOD_NOT_FOUND");
        if (period.status !== "open") throw new Error("PERIOD_STATUS");
        const updated = await tx
          .update(expensePeriod)
          .set({ status: "cancelled" })
          .where(eq(expensePeriod.id, periodId))
          .returning();
        const row = updated[0];
        if (!row) throw new Error("PERIOD_NOT_FOUND");
        return mapPeriod(row);
      },
    );
  }

  private async transitionInvoice(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
    next: InvoiceStatus,
    opts: {
      requireOwner: boolean;
      from: InvoiceStatus[];
      disputeNote?: string;
      issuedAt?: boolean;
      paidAt?: boolean;
    },
  ): Promise<MemberInvoiceSummary> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(memberInvoice)
          .where(
            and(
              eq(memberInvoice.id, invoiceId),
              eq(memberInvoice.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        const row = rows[0];
        if (!row) throw new Error("INVOICE_NOT_FOUND");
        if (opts.requireOwner && row.memberUserId !== actorUserId) {
          throw new Error("INVOICE_FORBIDDEN");
        }
        if (!opts.from.includes(row.status)) throw new Error("INVOICE_STATUS");

        await tx
          .update(memberInvoice)
          .set({
            status: next,
            disputeNote:
              next === "disputed" ? opts.disputeNote?.trim() || null : null,
            issuedAt: opts.issuedAt ? new Date() : row.issuedAt,
            paidAt: opts.paidAt ? new Date() : row.paidAt,
          })
          .where(eq(memberInvoice.id, invoiceId));

        return this.loadInvoice(tx, invoiceId, workspaceId);
      },
    );
  }

  private async loadInvoice(
    tx: AppDatabase,
    invoiceId: string,
    workspaceId: string,
  ): Promise<MemberInvoiceSummary> {
    const rows = await tx
      .select()
      .from(memberInvoice)
      .where(
        and(
          eq(memberInvoice.id, invoiceId),
          eq(memberInvoice.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("INVOICE_NOT_FOUND");
    const lines = await tx
      .select()
      .from(memberInvoiceLine)
      .where(eq(memberInvoiceLine.invoiceId, invoiceId));
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      periodId: row.periodId,
      memberUserId: row.memberUserId,
      status: row.status,
      sharedTotal: irr(row.sharedTotalMinor),
      privateTotal: irr(row.privateTotalMinor),
      total: irr(row.totalMinor),
      disputeNote: row.disputeNote ?? undefined,
      issuedAt: row.issuedAt?.toISOString(),
      paidAt: row.paidAt?.toISOString(),
      lines: lines
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((line) => ({
          id: line.id,
          expenseId: line.expenseId,
          visibility: line.visibility,
          title: line.title,
          amount: irr(line.amountMinor),
          lineNo: line.lineNo,
        })),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
