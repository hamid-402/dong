import {
  and,
  createDatabase,
  eq,
  expense,
  expensePeriod,
  expenseSplitLine,
  inArray,
  memberInvoice,
  memberInvoiceAdjustment,
  memberInvoiceLine,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  CreateExpensePeriodRequest,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  InvoiceStatus,
  MemberInvoiceAdjustmentSummary,
  MemberInvoiceSummary,
  Money,
  PeriodCadence,
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
  type MemberInvoiceBucket,
} from "@dang/contracts";
import type { BillingStore, InvoiceRecalcResult } from "./billing.types.js";

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
    cadence: (row.cadence as PeriodCadence | null) ?? "manual",
    autoRollover: row.autoRollover ?? false,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAdjustment(
  row: typeof memberInvoiceAdjustment.$inferSelect,
): MemberInvoiceAdjustmentSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    periodId: row.periodId,
    invoiceId: row.invoiceId,
    memberUserId: row.memberUserId,
    delta: irr(row.deltaMinor),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresBillingStore implements BillingStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresBillingStore {
    const { db } = createDatabase(connectionString);
    return new PostgresBillingStore(db);
  }

  /** Joins a caller's transaction when given, otherwise opens its own. */
  private run<T>(
    workspaceId: string,
    actorUserId: string,
    tx: AppDatabase | undefined,
    work: (tx: AppDatabase) => Promise<T>,
  ): Promise<T> {
    if (tx) return work(tx);
    return withTenantContext(this.db, { workspaceId, userId: actorUserId }, work);
  }

  async createPeriod(
    actorUserId: string,
    input: CreateExpensePeriodRequest,
    options: { tx?: AppDatabase } = {},
  ): Promise<ExpensePeriodSummary> {
    return this.run(
      input.workspaceId,
      actorUserId,
      options.tx,
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
            cadence: input.cadence ?? "manual",
            autoRollover: input.autoRollover ?? false,
            idempotencyKey: input.idempotencyKey.trim(),
            createdByUserId: actorUserId,
          })
          .onConflictDoNothing({
            target: [expensePeriod.workspaceId, expensePeriod.idempotencyKey],
          })
          .returning();
        const row = inserted[0];
        if (row) return mapPeriod(row);
        // Concurrent writer won the unique index — read their row back.
        const settled = await tx
          .select()
          .from(expensePeriod)
          .where(
            and(
              eq(expensePeriod.workspaceId, input.workspaceId),
              eq(expensePeriod.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (!settled[0]) throw new Error("PERIOD_INSERT_FAILED");
        return mapPeriod(settled[0]);
      },
    );
  }

  async ensureAutoPeriod(
    workspaceId: string,
    actorUserId: string,
    isoDate: string,
    options: { tx?: AppDatabase } = {},
  ): Promise<ExpensePeriodSummary> {
    return this.run(workspaceId, actorUserId, options.tx, async (tx) => {
      const rows = await tx
        .select()
        .from(expensePeriod)
        .where(eq(expensePeriod.workspaceId, workspaceId));
      const plan = planAutoPeriod(
        rows.map(mapPeriod),
        isoDate,
        new Date().toISOString().slice(0, 10),
      );
      if (plan.kind === "existing") return plan.period;
      return this.createPeriod(
        actorUserId,
        {
          workspaceId,
          title: plan.range.title,
          kind: plan.range.kind,
          startsOn: plan.range.startsOn,
          endsOn: plan.range.endsOn,
          cadence: plan.range.cadence,
          autoRollover: true,
          idempotencyKey: plan.idempotencyKey,
        },
        { tx },
      );
    });
  }

  async rolloverDuePeriods(
    workspaceId: string,
    actorUserId: string,
    today: string,
  ): Promise<ExpensePeriodSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(expensePeriod)
          .where(eq(expensePeriod.workspaceId, workspaceId));
        const periods = rows.map(mapPeriod);
        const due = periods.filter(
          (period) =>
            period.autoRollover &&
            period.cadence === "jalali_month" &&
            period.endsOn < today,
        );
        const opened: ExpensePeriodSummary[] = [];
        for (const period of due) {
          const range = nextJalaliMonthPeriod(period.endsOn);
          const known = [...periods, ...opened];
          if (pickPeriodForDate(known, range.startsOn)) continue;
          opened.push(
            await this.createPeriod(
              actorUserId,
              {
                workspaceId,
                title: range.title,
                kind: range.kind,
                startsOn: range.startsOn,
                endsOn: range.endsOn,
                cadence: range.cadence,
                autoRollover: true,
                idempotencyKey: autoPeriodIdempotencyKey(range),
              },
              { tx },
            ),
          );
        }
        return opened;
      },
    );
  }

  async listPeriods(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ExpensePeriodSummary[]> {
    try {
      return await withTenantContext(
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
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      // Schema lag after pull: cadence/auto_rollover added in 0073.
      if (/cadence|auto_rollover|autoRollover/i.test(detail)) {
        throw new Error(
          "PERIOD_SCHEMA_OUTDATED: migration 0073_billing_live_invoice را روی دیتابیس اعمال کنید",
        );
      }
      throw error;
    }
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

        const buckets = aggregateMemberInvoiceBuckets(
          await this.loadPeriodExpenses(tx, workspaceId, periodId),
        );

        const status: InvoiceStatus = options.sendForApproval
          ? "pending_approval"
          : "draft";

        for (const bucket of buckets) {
          const current = await this.findInvoiceRow(
            tx,
            workspaceId,
            periodId,
            bucket.memberUserId,
          );
          if (current && isInvoiceLocked(current.status)) continue;
          // No commitment, no document: pending amounts alone never open an invoice.
          if (bucket.totalMinor === 0n) {
            if (current) {
              await tx.delete(memberInvoice).where(eq(memberInvoice.id, current.id));
            }
            continue;
          }
          await this.writeInvoiceRow(tx, workspaceId, periodId, bucket, status);
        }

        // Only promote: regenerating drafts must not drag a period out of review.
        if (options.sendForApproval) {
          await tx
            .update(expensePeriod)
            .set({ status: "review" })
            .where(eq(expensePeriod.id, periodId));
        }

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

  async recalculateMemberInvoices(
    input: {
      workspaceId: string;
      periodId: string;
      actorUserId: string;
      memberUserIds: readonly string[];
      reason: string;
    },
    options: { tx?: AppDatabase } = {},
  ): Promise<InvoiceRecalcResult> {
    const { workspaceId, periodId, actorUserId, memberUserIds, reason } = input;
    return this.run(workspaceId, actorUserId, options.tx, async (tx) => {
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

      const buckets = aggregateMemberInvoiceBuckets(
        await this.loadPeriodExpenses(tx, workspaceId, periodId),
        { memberUserIds },
      );

      const result: InvoiceRecalcResult = {
        updated: [],
        adjustments: [],
        unchangedMemberUserIds: [],
      };

      for (const bucket of buckets) {
        const current = await this.findInvoiceRow(
          tx,
          workspaceId,
          periodId,
          bucket.memberUserId,
        );
        const hash = invoiceSourceHash(bucket);

        if (current && isInvoiceLocked(current.status)) {
          const delta = bucket.totalMinor - current.totalMinor;
          if (delta === 0n) {
            result.unchangedMemberUserIds.push(bucket.memberUserId);
            continue;
          }
          // Keyed on committed substance only: a new draft must not mint a notice.
          const idempotencyKey = `adj:${current.id}:${invoiceCommittedHash(bucket)}`;
          const inserted = await tx
            .insert(memberInvoiceAdjustment)
            .values({
              workspaceId,
              invoiceId: current.id,
              periodId,
              memberUserId: bucket.memberUserId,
              deltaMinor: delta,
              reason,
              idempotencyKey,
            })
            .onConflictDoNothing({
              target: [
                memberInvoiceAdjustment.workspaceId,
                memberInvoiceAdjustment.idempotencyKey,
              ],
            })
            .returning();
          const row =
            inserted[0] ??
            (
              await tx
                .select()
                .from(memberInvoiceAdjustment)
                .where(
                  and(
                    eq(memberInvoiceAdjustment.workspaceId, workspaceId),
                    eq(memberInvoiceAdjustment.idempotencyKey, idempotencyKey),
                  ),
                )
                .limit(1)
            )[0];
          if (row) result.adjustments.push(mapAdjustment(row));
          continue;
        }

        // Pending amounts ride along on an existing document; they never open one.
        if (bucket.totalMinor === 0n) {
          if (current) {
            await tx.delete(memberInvoice).where(eq(memberInvoice.id, current.id));
          }
          result.unchangedMemberUserIds.push(bucket.memberUserId);
          continue;
        }

        if (current && current.sourceHash === hash) {
          result.unchangedMemberUserIds.push(bucket.memberUserId);
          continue;
        }

        result.updated.push(
          await this.writeInvoiceRow(
            tx,
            workspaceId,
            periodId,
            bucket,
            current?.status ?? "draft",
            hash,
          ),
        );
      }

      return result;
    });
  }

  async listAdjustments(
    workspaceId: string,
    periodId: string,
    actorUserId: string,
  ): Promise<MemberInvoiceAdjustmentSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(memberInvoiceAdjustment)
          .where(
            and(
              eq(memberInvoiceAdjustment.workspaceId, workspaceId),
              eq(memberInvoiceAdjustment.periodId, periodId),
            ),
          );
        return rows
          .map(mapAdjustment)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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

  async listPendingApprovals(
    workspaceId: string,
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
              eq(memberInvoice.memberUserId, actorUserId),
              eq(memberInvoice.status, "pending_approval"),
            ),
          );
        const result: MemberInvoiceSummary[] = [];
        for (const row of rows) {
          result.push(await this.loadInvoice(tx, row.id, workspaceId));
        }
        return result;
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

  async resolveInvoiceDispute(
    workspaceId: string,
    invoiceId: string,
    actorUserId: string,
    input: ResolveInvoiceDisputeRequest,
  ): Promise<MemberInvoiceSummary> {
    // Accepted: the figures are in question, so the document returns to the live
    // projection. Rejected: it stands exactly as issued.
    return this.transitionInvoice(
      workspaceId,
      invoiceId,
      actorUserId,
      input.outcome === "accepted" ? "draft" : "issued",
      { requireOwner: false, from: ["disputed"] },
    );
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

  /** Expenses of a period plus their split lines, in aggregation shape. */
  private async loadPeriodExpenses(
    tx: AppDatabase,
    workspaceId: string,
    periodId: string,
  ) {
    const rows = await tx
      .select()
      .from(expense)
      .where(
        and(eq(expense.workspaceId, workspaceId), eq(expense.periodId, periodId)),
      );
    if (rows.length === 0) return [];
    const splits = await tx
      .select()
      .from(expenseSplitLine)
      .where(
        inArray(
          expenseSplitLine.expenseId,
          rows.map((row) => row.id),
        ),
      );
    const byExpense = new Map<string, typeof splits>();
    for (const split of splits) {
      const bucket = byExpense.get(split.expenseId) ?? [];
      bucket.push(split);
      byExpense.set(split.expenseId, bucket);
    }
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      visibility: row.visibility,
      title: row.title,
      occurredOn: row.occurredOn,
      splits: (byExpense.get(row.id) ?? [])
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((split) => ({
          userId: split.userId,
          amount: irr(split.amountMinor),
        })),
    }));
  }

  private async findInvoiceRow(
    tx: AppDatabase,
    workspaceId: string,
    periodId: string,
    memberUserId: string,
  ) {
    const rows = await tx
      .select()
      .from(memberInvoice)
      .where(
        and(
          eq(memberInvoice.workspaceId, workspaceId),
          eq(memberInvoice.periodId, periodId),
          eq(memberInvoice.memberUserId, memberUserId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /**
   * Upserts one member's draft invoice on the (period, member) unique index
   * and replaces its committed lines. Locked documents never reach here.
   */
  private async writeInvoiceRow(
    tx: AppDatabase,
    workspaceId: string,
    periodId: string,
    bucket: MemberInvoiceBucket,
    status: InvoiceStatus,
    sourceHash?: string,
  ): Promise<MemberInvoiceSummary> {
    const hash = sourceHash ?? invoiceSourceHash(bucket);
    const now = new Date();
    const current = await this.findInvoiceRow(
      tx,
      workspaceId,
      periodId,
      bucket.memberUserId,
    );

    let invoiceId: string;
    if (current) {
      await tx
        .update(memberInvoice)
        .set({
          status,
          sharedTotalMinor: bucket.sharedMinor,
          privateTotalMinor: bucket.privateMinor,
          totalMinor: bucket.totalMinor,
          version: (current.version ?? 1) + 1,
          recalculatedAt: now,
          sourceHash: hash,
        })
        .where(eq(memberInvoice.id, current.id));
      invoiceId = current.id;
      await tx
        .delete(memberInvoiceLine)
        .where(eq(memberInvoiceLine.invoiceId, invoiceId));
    } else {
      const inserted = await tx
        .insert(memberInvoice)
        .values({
          workspaceId,
          periodId,
          memberUserId: bucket.memberUserId,
          status,
          sharedTotalMinor: bucket.sharedMinor,
          privateTotalMinor: bucket.privateMinor,
          totalMinor: bucket.totalMinor,
          idempotencyKey: `period:${periodId}:member:${bucket.memberUserId}`,
          version: 1,
          recalculatedAt: now,
          sourceHash: hash,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("INVOICE_INSERT_FAILED");
      invoiceId = row.id;
    }

    if (bucket.lines.length) {
      await tx.insert(memberInvoiceLine).values(
        bucket.lines.map((line, index) => ({
          invoiceId,
          workspaceId,
          expenseId: line.expenseId,
          visibility: line.visibility,
          title: line.title,
          amountMinor: line.amountMinor,
          lineNo: index + 1,
        })),
      );
    }

    const summary = await this.loadInvoice(tx, invoiceId, workspaceId);
    return { ...summary, pendingTotal: irr(bucket.pendingMinor) };
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
    // The spend date lives on the expense, so it is joined at read time instead
    // of being copied into the line and risking two answers for one fact.
    const lines = await tx
      .select({
        id: memberInvoiceLine.id,
        expenseId: memberInvoiceLine.expenseId,
        visibility: memberInvoiceLine.visibility,
        title: memberInvoiceLine.title,
        amountMinor: memberInvoiceLine.amountMinor,
        lineNo: memberInvoiceLine.lineNo,
        occurredOn: expense.occurredOn,
      })
      .from(memberInvoiceLine)
      .leftJoin(expense, eq(expense.id, memberInvoiceLine.expenseId))
      .where(eq(memberInvoiceLine.invoiceId, invoiceId));
    const summary: MemberInvoiceSummary = {
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
          ...(line.occurredOn ? { occurredOn: line.occurredOn } : {}),
        })),
      createdAt: row.createdAt.toISOString(),
      version: row.version ?? 1,
      recalculatedAt: row.recalculatedAt?.toISOString(),
    };
    assertInvoiceTotalConsistent(summary);
    return summary;
  }
}
