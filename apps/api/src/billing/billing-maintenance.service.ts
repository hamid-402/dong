import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createLogger } from "@dang/observability";
import {
  aggregateMemberInvoiceBuckets,
  isFinanceManagerRole,
  type JournalEntrySummary,
  type MemberInvoiceAdjustmentSummary,
  type WorkerJobName,
} from "@dang/contracts";
import { EXPENSE_STORE, type ExpenseStore } from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { JOB_RUN_STORE, type JobRunStore } from "../jobs/job-run.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";
import { BILLING_STORE, type BillingStore } from "./billing.types.js";

const logger = createLogger("dang-api-billing-maintenance");

/** Default sweep interval; the first expense of a new month rolls over anyway. */
const TICK_MS = 6 * 60 * 60 * 1000;

/** How close to the period end the finance reminder fires. */
const FINALIZE_REMINDER_DAYS = 3;

export type RolloverResult = {
  openedPeriodIds: string[];
};

export type ReconcileResult = {
  periodsChecked: number;
  membersChecked: number;
  /** Stored invoice figures that disagreed with the committed expenses. */
  drift: Array<{
    periodId: string;
    memberUserId: string;
    expectedMinor: string;
    invoiceMinor: string;
  }>;
  /** Draft invoices rewritten from source during this pass. */
  repaired: number;
  /** Correction notices raised because the member's invoice was locked. */
  adjustmentsRaised: number;
  /**
   * Members whose ledger debit total for the period differs from their
   * committed share. This cannot be repaired from here — a posting escaped the
   * journal, which needs a human.
   */
  ledgerGaps: Array<{
    periodId: string;
    memberUserId: string;
    expectedMinor: string;
    ledgerMinor: string;
  }>;
};

export type FinalizeReminderResult = {
  notified: number;
  periodIds: string[];
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Each member's debit total across the posted expense journal entries of a
 * period — the ledger's own answer to "how much does this member owe here?".
 * Reversed entries carry no financial effect, so they are skipped.
 */
function memberDebitsForExpenses(
  journal: readonly JournalEntrySummary[],
  expenseIds: ReadonlySet<string>,
): Map<string, bigint> {
  const byMember = new Map<string, bigint>();
  for (const entry of journal) {
    if (entry.sourceType !== "expense" || entry.status !== "posted") continue;
    if (!expenseIds.has(entry.sourceId)) continue;
    for (const line of entry.lines) {
      if (line.side !== "debit") continue;
      byMember.set(
        line.userId,
        (byMember.get(line.userId) ?? 0n) + BigInt(line.amount.amountMinor),
      );
    }
  }
  return byMember;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return at.toISOString().slice(0, 10);
}

/**
 * Scheduled billing hygiene: open the next period, prove ledger and invoices
 * agree, and remind finance before a period ends.
 *
 * The sweep only visits workspaces this process has actually served, because
 * every store call is tenant-scoped and needs a real member as the actor —
 * there is no cross-tenant listing to enumerate. Explicit runs come through
 * `POST …/jobs`, which carries an authorized actor.
 */
@Injectable()
export class BillingMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly seen = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(OutboxRelay) private readonly outboxRelay: OutboxRelay,
    @Optional() @Inject(EXPENSE_STORE) private readonly expenses?: ExpenseStore,
    @Optional() @Inject(LEDGER_STORE) private readonly ledger?: LedgerStore,
    @Optional()
    @Inject(NotificationsService)
    private readonly notifications?: NotificationsService,
    @Optional() @Inject(JOB_RUN_STORE) private readonly jobRuns?: JobRunStore,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    const raw = process.env.BILLING_MAINTENANCE_INTERVAL_MS?.trim();
    const ms = raw ? Number(raw) : TICK_MS;
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.timer = setInterval(() => {
      void this.tick().catch((err: unknown) => {
        logger.warn("billing maintenance tick failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
      });
    }, ms);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * What the sweep can honestly claim right now. `sweep_v1` means the timer is
   * running and periods roll over, reconcile and remind on their own;
   * `on_demand` means only an explicit job run or a write does that work.
   */
  mode(): "sweep_v1" | "on_demand" {
    return this.timer ? "sweep_v1" : "on_demand";
  }

  /** Whether reconcile can prove the journal, not just the projection. */
  reconcileMode(): "expense_ledger_invoice_v1" | "expense_invoice_v1" | "off" {
    if (!this.expenses) return "off";
    return this.ledger ? "expense_ledger_invoice_v1" : "expense_invoice_v1";
  }

  /** Registers a workspace + a member the sweep can act as. */
  remember(workspaceId: string, actorUserId: string): void {
    if (!workspaceId || !actorUserId) return;
    this.seen.set(workspaceId, actorUserId);
  }

  async tick(): Promise<void> {
    for (const [workspaceId, actorUserId] of [...this.seen]) {
      try {
        const opened = await this.rollover(workspaceId, actorUserId);
        if (opened.openedPeriodIds.length > 0) {
          await this.recordRun(workspaceId, "billing.period.rollover", {
            opened: opened.openedPeriodIds.length,
          });
        }
        const checked = await this.reconcile(workspaceId, actorUserId);
        if (
          checked.repaired > 0 ||
          checked.adjustmentsRaised > 0 ||
          checked.ledgerGaps.length > 0
        ) {
          await this.recordRun(
            workspaceId,
            "billing.invoice.reconcile",
            {
              drift: checked.drift.length,
              repaired: checked.repaired,
              adjustments: checked.adjustmentsRaised,
              ledgerGaps: checked.ledgerGaps.length,
            },
            checked.ledgerGaps.length > 0 ? "failed" : "completed",
          );
        }
        const reminded = await this.finalizeReminder(workspaceId, actorUserId);
        if (reminded.notified > 0) {
          await this.recordRun(workspaceId, "billing.period.finalize.reminder", {
            notified: reminded.notified,
            periods: reminded.periodIds.length,
          });
        }
      } catch (err: unknown) {
        logger.warn("billing maintenance skipped workspace", {
          workspaceId,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Leaves a visible trace of unattended work, so the jobs page can answer "did
   * the automation actually run, and what did it change?" — silent when a pass
   * found nothing to do, because an empty row is noise, not evidence.
   */
  private async recordRun(
    workspaceId: string,
    name: WorkerJobName,
    detail: Record<string, number>,
    status: "completed" | "failed" = "completed",
  ): Promise<void> {
    if (!this.jobRuns) return;
    const now = new Date().toISOString();
    const summary = Object.entries(detail)
      .map(([key, value]) => `${key}=${value.toString()}`)
      .join(" ");
    try {
      await this.jobRuns.append({
        jobId: randomUUID(),
        name,
        status,
        execution: "inline_stub",
        detail: `${name} sweep ${summary}`,
        workspaceId,
        createdAt: now,
        finishedAt: now,
        ...(status === "failed"
          ? { lastError: "ledger and committed expenses disagree" }
          : {}),
      });
    } catch (err: unknown) {
      logger.warn("could not record billing sweep run", {
        workspaceId,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async rollover(
    workspaceId: string,
    actorUserId: string,
  ): Promise<RolloverResult> {
    const opened = await this.billing.rolloverDuePeriods(
      workspaceId,
      actorUserId,
      today(),
    );
    if (opened.length === 0) return { openedPeriodIds: [] };

    const members = (await this.iam.listMembers(workspaceId, actorUserId)) ?? [];
    const memberUserIds = members.map((member) => member.userId);
    for (const period of opened) {
      const corr = this.outboxRelay.correlation();
      const row = await this.outbox.insert({
        workspaceId,
        aggregateType: "expense_period",
        aggregateId: period.id,
        eventType: "period.rolled",
        payload: {
          periodId: period.id,
          title: period.title,
          startsOn: period.startsOn,
          endsOn: period.endsOn,
          memberUserIds,
        },
        requestId: corr.requestId,
        traceId: corr.traceId,
      });
      await this.outboxRelay.dispatch(row).catch(() => {
        // Relay retries pending rows on its own schedule.
      });
    }
    return { openedPeriodIds: opened.map((period) => period.id) };
  }

  /**
   * Three-way check for every live period: the committed expenses are the truth,
   * the journal must debit each member exactly their share, and the stored
   * invoice must report the same figure. Projection drift is repaired here
   * (rewriting a draft, or raising a correction notice on a locked document);
   * a journal gap is reported, never papered over.
   */
  async reconcile(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ReconcileResult> {
    const result: ReconcileResult = {
      periodsChecked: 0,
      membersChecked: 0,
      drift: [],
      repaired: 0,
      adjustmentsRaised: 0,
      ledgerGaps: [],
    };
    if (!this.expenses) return result;

    const periods = await this.billing.listPeriods(workspaceId, actorUserId);
    const live = periods.filter(
      (period) => period.status === "open" || period.status === "review",
    );
    if (live.length === 0) return result;

    const allExpenses = await this.expenses.listForWorkspace(
      workspaceId,
      actorUserId,
      { viewAllPrivate: true },
    );
    const journal = this.ledger
      ? await this.ledger.listForWorkspace(workspaceId, actorUserId)
      : [];

    for (const period of live) {
      result.periodsChecked += 1;
      const periodExpenses = allExpenses.filter(
        (expense) => expense.periodId === period.id,
      );
      const expected = aggregateMemberInvoiceBuckets(periodExpenses);
      const invoices = await this.billing.listInvoices(
        workspaceId,
        period.id,
        actorUserId,
      );
      const invoiceByMember = new Map(
        invoices.map((invoice) => [invoice.memberUserId, invoice]),
      );
      const ledgerByMember = memberDebitsForExpenses(
        journal,
        new Set(periodExpenses.map((expense) => expense.id)),
      );

      const drifted = new Set<string>();
      for (const bucket of expected) {
        result.membersChecked += 1;
        const invoice = invoiceByMember.get(bucket.memberUserId);
        const invoiceMinor = invoice ? BigInt(invoice.total.amountMinor) : 0n;
        const invoicePending = invoice?.pendingTotal
          ? BigInt(invoice.pendingTotal.amountMinor)
          : 0n;
        // Pending only counts as drift on a document that already exists —
        // an uncommitted amount never opens one.
        const pendingDrift =
          invoice != null && invoicePending !== bucket.pendingMinor;
        if (invoiceMinor !== bucket.totalMinor || pendingDrift) {
          result.drift.push({
            periodId: period.id,
            memberUserId: bucket.memberUserId,
            expectedMinor: bucket.totalMinor.toString(),
            invoiceMinor: invoiceMinor.toString(),
          });
          drifted.add(bucket.memberUserId);
        }
        const ledgerMinor = ledgerByMember.get(bucket.memberUserId) ?? 0n;
        if (this.ledger && ledgerMinor !== bucket.totalMinor) {
          result.ledgerGaps.push({
            periodId: period.id,
            memberUserId: bucket.memberUserId,
            expectedMinor: bucket.totalMinor.toString(),
            ledgerMinor: ledgerMinor.toString(),
          });
        }
      }

      // Invoices left behind by members who no longer carry anything.
      const expectedMembers = new Set(
        expected.map((bucket) => bucket.memberUserId),
      );
      for (const invoice of invoices) {
        if (expectedMembers.has(invoice.memberUserId)) continue;
        result.membersChecked += 1;
        if (BigInt(invoice.total.amountMinor) === 0n) continue;
        result.drift.push({
          periodId: period.id,
          memberUserId: invoice.memberUserId,
          expectedMinor: "0",
          invoiceMinor: invoice.total.amountMinor,
        });
        drifted.add(invoice.memberUserId);
      }

      if (drifted.size === 0) continue;
      const repair = await this.billing.recalculateMemberInvoices({
        workspaceId,
        periodId: period.id,
        actorUserId,
        memberUserIds: [...drifted],
        reason: "billing.invoice.reconcile",
      });
      result.repaired += repair.updated.length;
      result.adjustmentsRaised += repair.adjustments.length;
      if (repair.updated.length > 0 || repair.adjustments.length > 0) {
        await this.publishRecalculated(workspaceId, period.id, [...drifted], {
          actorUserId,
          adjustments: repair.adjustments,
        });
      }
    }

    if (result.ledgerGaps.length > 0) {
      logger.error("ledger and committed expenses disagree", {
        workspaceId,
        count: result.ledgerGaps.length,
      });
    }
    if (result.drift.length > 0) {
      logger.warn("invoice projection drift repaired", {
        workspaceId,
        drift: result.drift.length,
        repaired: result.repaired,
        adjustments: result.adjustmentsRaised,
      });
    }
    return result;
  }

  /**
   * Tells the affected members' clients that their invoice figures moved, and
   * carries any correction notices so the members holding a locked document are
   * told rather than left to notice the difference.
   */
  private async publishRecalculated(
    workspaceId: string,
    periodId: string,
    memberUserIds: readonly string[],
    options: {
      actorUserId: string;
      adjustments?: readonly MemberInvoiceAdjustmentSummary[];
    },
  ): Promise<void> {
    const corr = this.outboxRelay.correlation();
    const row = await this.outbox.insert({
      workspaceId,
      aggregateType: "member_invoice",
      aggregateId: periodId,
      eventType: "invoice.recalculated",
      payload: {
        periodId,
        memberUserIds: [...memberUserIds],
        reason: "billing.invoice.reconcile",
        actorUserId: options.actorUserId,
        ...(options.adjustments?.length
          ? {
              adjustments: options.adjustments.map((row) => ({
                memberUserId: row.memberUserId,
                deltaMinor: row.delta.amountMinor,
              })),
            }
          : {}),
      },
      requestId: corr.requestId,
      traceId: corr.traceId,
    });
    await this.outboxRelay.dispatch(row).catch(() => {
      // Relay retries pending rows on its own schedule.
    });
  }

  /**
   * Reminds finance managers that a period is about to end. Issuing invoices
   * stays a human action — segregation of duties, not an automated close.
   */
  async finalizeReminder(
    workspaceId: string,
    actorUserId: string,
  ): Promise<FinalizeReminderResult> {
    const out: FinalizeReminderResult = { notified: 0, periodIds: [] };
    if (!this.notifications) return out;

    const now = today();
    const horizon = addDays(now, FINALIZE_REMINDER_DAYS);
    const periods = await this.billing.listPeriods(workspaceId, actorUserId);
    const due = periods.filter(
      (period) =>
        period.status === "open" && period.endsOn >= now && period.endsOn <= horizon,
    );
    if (due.length === 0) return out;

    const members = (await this.iam.listMembers(workspaceId, actorUserId)) ?? [];
    const financeManagers = members.filter((member) =>
      isFinanceManagerRole(member.role),
    );
    for (const period of due) {
      for (const manager of financeManagers) {
        await this.notifications.notify(actorUserId, {
          workspaceId,
          userId: manager.userId,
          channel: "in_app",
          title: "پایان دورهٔ مالی نزدیک است",
          body: `دورهٔ «${period.title}» در ${period.endsOn} تمام می‌شود؛ صورتحساب‌ها را بررسی و صادر کنید.`,
          metadata: { periodId: period.id, endsOn: period.endsOn },
        });
        out.notified += 1;
      }
      out.periodIds.push(period.id);
    }
    return out;
  }
}
