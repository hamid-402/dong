import type {
  ExpensePeriodSummary,
  ExpenseVisibility,
  InvoiceStatus,
  MemberInvoiceLineSummary,
  PeriodCadence,
} from "./billing.js";
import {
  gregorianToJalali,
  isoFromJalali,
  jalaliMonthLength,
  parseIsoToJalali,
  JALALI_MONTH_FA,
} from "./daily-ledger.js";
import type { Money } from "./money.js";

/**
 * Expense statuses that carry a committed financial effect.
 * Invoices and member statements both build on this single rule so the
 * two documents can never report a different truth for the same expense.
 */
export const INVOICE_COMMITTED_STATUSES = ["posted"] as const;

/** In-flight expenses: shown separately, never folded into invoice totals. */
export const INVOICE_PENDING_STATUSES = ["draft", "submitted"] as const;

/** Statuses where the member already acted, so the document must stay immutable. */
export const INVOICE_LOCKED_STATUSES: readonly InvoiceStatus[] = [
  "disputed",
  "approved",
  "issued",
  "paid",
  "cancelled",
];

export function isInvoiceLocked(status: InvoiceStatus): boolean {
  return INVOICE_LOCKED_STATUSES.includes(status);
}

export type PeriodRange = {
  title: string;
  kind: "month";
  cadence: PeriodCadence;
  startsOn: string;
  endsOn: string;
};

/** Jalali month range covering an ISO date — the local fiscal month. */
export function jalaliMonthPeriodForDate(isoDate: string): PeriodRange {
  const parts = parseIsoToJalali(isoDate);
  const fallback = (() => {
    const now = new Date();
    return gregorianToJalali(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
    );
  })();
  const { jy, jm } = parts ?? fallback;
  const lastDay = jalaliMonthLength(jy, jm);
  return {
    title: `${JALALI_MONTH_FA[jm - 1]} ${jy}`,
    kind: "month",
    cadence: "jalali_month",
    startsOn: isoFromJalali(jy, jm, 1),
    endsOn: isoFromJalali(jy, jm, lastDay),
  };
}

/** Jalali month range immediately after the given range's end. */
export function nextJalaliMonthPeriod(endsOn: string): PeriodRange {
  const [ys, ms, ds] = endsOn.split("-").map(Number);
  const next = new Date(Date.UTC(ys ?? 1970, (ms ?? 1) - 1, (ds ?? 1) + 1));
  return jalaliMonthPeriodForDate(next.toISOString().slice(0, 10));
}

/**
 * Advance a recurring rule's next_run_on.
 * monthly/yearly use Jalali calendar (Iran market); weekly stays +7 Gregorian days.
 */
export function advanceRecurringNextRunOn(
  isoDate: string,
  cadence: "weekly" | "monthly" | "yearly",
): string {
  if (cadence === "weekly") {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const parts = parseIsoToJalali(isoDate);
  if (!parts) {
    const d = new Date(`${isoDate}T00:00:00Z`);
    if (cadence === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  let { jy, jm } = parts;
  const { jd } = parts;
  if (cadence === "yearly") {
    jy += 1;
  } else {
    jm += 1;
    if (jm > 12) {
      jm = 1;
      jy += 1;
    }
  }
  const last = jalaliMonthLength(jy, jm);
  return isoFromJalali(jy, jm, Math.min(jd, last));
}

/**
 * Stable key so concurrent writers converge on one auto period per range
 * (relies on the existing `expense_period_idempotency_uq` constraint).
 */
export function autoPeriodIdempotencyKey(range: {
  startsOn: string;
  endsOn: string;
}): string {
  return `auto:${range.startsOn}:${range.endsOn}`;
}

/** Where an auto-inferred expense date should be booked. */
export type AutoPeriodPlan =
  | { kind: "existing"; period: ExpensePeriodSummary }
  | { kind: "create"; range: PeriodRange; idempotencyKey: string };

/**
 * Decides which period a cost dated `isoDate` belongs to, given today's date.
 *
 * The rule that matters: closed books stay closed. When the month covering the
 * cost has already been closed, re-creating its range is not an option — the
 * stable auto key would resolve straight back to the closed period — so the
 * cost is booked in the live period as a prior-period item, keeping its real
 * `occurredOn`. Only if nothing live exists is a period opened, and a month
 * that exists but is shut gets a supplementary one rather than a collision.
 */
export function planAutoPeriod(
  periods: readonly ExpensePeriodSummary[],
  isoDate: string,
  today: string,
): AutoPeriodPlan {
  const covering = pickPeriodForDate(periods, isoDate);
  if (covering) return { kind: "existing", period: covering };

  const keys = new Set(
    periods.map((period) => autoPeriodIdempotencyKey(period)),
  );
  const range = jalaliMonthPeriodForDate(isoDate);
  const key = autoPeriodIdempotencyKey(range);
  if (!keys.has(key)) return { kind: "create", range, idempotencyKey: key };

  // That month exists and no longer accepts postings: book it where the books
  // are still open.
  const live = pickPeriodForDate(periods, today);
  if (live) return { kind: "existing", period: live };

  const currentRange = jalaliMonthPeriodForDate(today);
  const currentKey = autoPeriodIdempotencyKey(currentRange);
  if (!keys.has(currentKey)) {
    return { kind: "create", range: currentRange, idempotencyKey: currentKey };
  }
  // Even the current month was closed, so open a supplementary period beside it
  // instead of handing back the shut one.
  return {
    kind: "create",
    range: { ...currentRange, title: `${currentRange.title} (تکمیلی)` },
    idempotencyKey: `${currentKey}:supplement`,
  };
}

/**
 * Period whose range covers `isoDate` and still accepts postings.
 * Closed / cancelled periods are skipped so a late expense lands in a live period.
 */
export function pickPeriodForDate(
  periods: readonly ExpensePeriodSummary[],
  isoDate: string,
): ExpensePeriodSummary | null {
  const open = periods.filter(
    (period) => period.status === "open" || period.status === "review",
  );
  const covering = open.filter(
    (period) => period.startsOn <= isoDate && isoDate <= period.endsOn,
  );
  if (covering.length === 0) return null;
  // Narrowest range wins: a weekly outing period beats an enclosing month.
  return [...covering].sort((a, b) => {
    const spanA = daySpan(a.startsOn, a.endsOn);
    const spanB = daySpan(b.startsOn, b.endsOn);
    if (spanA !== spanB) return spanA - spanB;
    return b.startsOn.localeCompare(a.startsOn);
  })[0]!;
}

/** Whole days covered by an inclusive ISO range; malformed input sorts last. */
function daySpan(startsOn: string, endsOn: string): number {
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export type MemberInvoiceBucket = {
  memberUserId: string;
  sharedMinor: bigint;
  privateMinor: bigint;
  totalMinor: bigint;
  /** Committed lines only — pending amounts are reported separately. */
  lines: Array<{
    expenseId: string;
    visibility: ExpenseVisibility;
    title: string;
    amountMinor: bigint;
    /** Real spend date — a line older than the period is a prior-period item. */
    occurredOn?: string;
  }>;
  pendingMinor: bigint;
};

/**
 * Minimal expense shape the aggregation needs — both `ExpenseSummary` and a
 * raw Postgres row projection satisfy it, so no casting is required.
 */
export type InvoiceSourceExpense = {
  id: string;
  status: string;
  visibility?: ExpenseVisibility | null;
  title: string;
  occurredOn?: string | null;
  splits: readonly { userId: string; amount: Money }[];
};

/**
 * Single aggregation used by both the live recalculation and the manual
 * period generate, so one expense can never produce two different invoices.
 */
export function aggregateMemberInvoiceBuckets(
  expenses: readonly InvoiceSourceExpense[],
  options: { memberUserIds?: readonly string[] } = {},
): MemberInvoiceBucket[] {
  const only = options.memberUserIds ? new Set(options.memberUserIds) : null;
  const buckets = new Map<string, MemberInvoiceBucket>();
  const ensure = (memberUserId: string): MemberInvoiceBucket => {
    let bucket = buckets.get(memberUserId);
    if (!bucket) {
      bucket = {
        memberUserId,
        sharedMinor: 0n,
        privateMinor: 0n,
        totalMinor: 0n,
        lines: [],
        pendingMinor: 0n,
      };
      buckets.set(memberUserId, bucket);
    }
    return bucket;
  };

  for (const expense of expenses) {
    const committed = (INVOICE_COMMITTED_STATUSES as readonly string[]).includes(
      expense.status,
    );
    const pending = (INVOICE_PENDING_STATUSES as readonly string[]).includes(
      expense.status,
    );
    if (!committed && !pending) continue;
    for (const split of expense.splits) {
      if (only && !only.has(split.userId)) continue;
      const amount = BigInt(split.amount.amountMinor);
      const bucket = ensure(split.userId);
      if (!committed) {
        bucket.pendingMinor += amount;
        continue;
      }
      const visibility = expense.visibility ?? "shared";
      if (visibility === "private") bucket.privateMinor += amount;
      else bucket.sharedMinor += amount;
      bucket.totalMinor += amount;
      bucket.lines.push({
        expenseId: expense.id,
        visibility,
        title: expense.title,
        amountMinor: amount,
        ...(expense.occurredOn ? { occurredOn: expense.occurredOn } : {}),
      });
    }
  }

  if (only) {
    for (const memberUserId of only) ensure(memberUserId);
  }
  return [...buckets.values()];
}

/**
 * Fingerprint of the committed lines only — the accounting substance of the
 * document. Correction notices key off this so a pending draft can never mint
 * a second notice for the same committed delta.
 */
export function invoiceCommittedHash(bucket: MemberInvoiceBucket): string {
  // Visibility belongs in the fingerprint: it splits the same total between the
  // shared and private figures, so promoting a private cost to the company must
  // rewrite the document even though nothing is owed differently.
  const parts = bucket.lines
    .map((line) => `${line.expenseId}:${line.amountMinor.toString()}:${line.visibility}`)
    .sort();
  return `${bucket.totalMinor.toString()}|${parts.join(",")}`;
}

/**
 * Fingerprint of everything an invoice reports: committed lines plus the
 * pending amount shown beside them. Lets the store skip a rewrite when nothing
 * changed, while a new draft still refreshes the pending figure.
 */
export function invoiceSourceHash(bucket: MemberInvoiceBucket): string {
  return `${invoiceCommittedHash(bucket)}|pending:${bucket.pendingMinor.toString()}`;
}

export function toMemberInvoiceLines(
  bucket: MemberInvoiceBucket,
  makeId: () => string,
): MemberInvoiceLineSummary[] {
  return bucket.lines.map((line, index) => ({
    id: makeId(),
    expenseId: line.expenseId,
    visibility: line.visibility,
    title: line.title,
    amount: { amountMinor: line.amountMinor.toString(), currency: "IRR" },
    lineNo: index + 1,
    ...(line.occurredOn ? { occurredOn: line.occurredOn } : {}),
  }));
}

/**
 * Correction note for an already-locked invoice: the issued document stays
 * immutable and the delta is carried as a separate accounting notice.
 */
export type MemberInvoiceAdjustmentSummary = {
  id: string;
  workspaceId: string;
  periodId: string;
  invoiceId: string;
  memberUserId: string;
  /** Positive = extra charge (debit note), negative = credit note. */
  delta: Money;
  reason: string;
  createdAt: string;
};
