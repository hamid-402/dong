import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateMemberInvoiceBuckets,
  autoPeriodIdempotencyKey,
  invoiceCommittedHash,
  invoiceSourceHash,
  isInvoiceLocked,
  jalaliMonthPeriodForDate,
  nextJalaliMonthPeriod,
  advanceRecurringNextRunOn,
  pickPeriodForDate,
  planAutoPeriod,
} from "../src/billing-automation.js";
import {
  isoFromJalali,
  jalaliMonthLength,
  parseIsoToJalali,
} from "../src/daily-ledger.js";
import type { ExpensePeriodSummary } from "../src/billing.js";

function period(
  overrides: Partial<ExpensePeriodSummary> & Pick<ExpensePeriodSummary, "id">,
): ExpensePeriodSummary {
  return {
    workspaceId: "w1",
    title: overrides.title ?? "دوره",
    kind: "month",
    status: "open",
    startsOn: "2026-03-21",
    endsOn: "2026-04-20",
    cadence: "jalali_month",
    autoRollover: true,
    createdByUserId: "u0",
    createdAt: "2026-03-21T00:00:00.000Z",
    ...overrides,
  };
}

test("jalali month range covers the given date and is contiguous", () => {
  const range = jalaliMonthPeriodForDate("2026-04-05");
  assert.ok(range.startsOn <= "2026-04-05");
  assert.ok(range.endsOn >= "2026-04-05");
  assert.equal(range.cadence, "jalali_month");
  assert.equal(range.kind, "month");

  const next = nextJalaliMonthPeriod(range.endsOn);
  const dayAfter = new Date(`${range.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  assert.equal(next.startsOn, dayAfter.toISOString().slice(0, 10));
});

test("auto period key is stable for the same range", () => {
  const range = jalaliMonthPeriodForDate("2026-04-05");
  assert.equal(
    autoPeriodIdempotencyKey(range),
    autoPeriodIdempotencyKey(jalaliMonthPeriodForDate("2026-04-06")),
  );
});

test("picks the narrowest live period covering the date", () => {
  const month = period({ id: "month", startsOn: "2026-03-21", endsOn: "2026-04-20" });
  const week = period({
    id: "week",
    kind: "week",
    startsOn: "2026-04-01",
    endsOn: "2026-04-07",
  });
  const picked = pickPeriodForDate([month, week], "2026-04-03");
  assert.equal(picked?.id, "week");
});

test("narrowest wins even when both ranges start on the same day", () => {
  const month = period({ id: "month", startsOn: "2026-04-01", endsOn: "2026-04-30" });
  const week = period({
    id: "week",
    kind: "week",
    startsOn: "2026-04-01",
    endsOn: "2026-04-07",
  });
  assert.equal(pickPeriodForDate([month, week], "2026-04-03")?.id, "week");
  assert.equal(pickPeriodForDate([week, month], "2026-04-03")?.id, "week");
});

test("closed and cancelled periods are never picked", () => {
  const closed = period({ id: "closed", status: "closed" });
  const cancelled = period({ id: "cancelled", status: "cancelled" });
  assert.equal(pickPeriodForDate([closed, cancelled], "2026-04-01"), null);
});

test("a fresh month is opened for a date no period covers", () => {
  const plan = planAutoPeriod([], "2026-04-05", "2026-04-10");
  assert.equal(plan.kind, "create");
  if (plan.kind !== "create") return;
  assert.ok(plan.range.startsOn <= "2026-04-05" && "2026-04-05" <= plan.range.endsOn);
  assert.equal(plan.idempotencyKey, autoPeriodIdempotencyKey(plan.range));
});

test("a late cost for a closed month is booked in the live period", () => {
  const shut = period({
    id: "farvardin",
    status: "closed",
    startsOn: "2026-03-21",
    endsOn: "2026-04-20",
  });
  const open = period({
    id: "ordibehesht",
    startsOn: "2026-04-21",
    endsOn: "2026-05-21",
  });

  const plan = planAutoPeriod([shut, open], "2026-04-05", "2026-05-02");
  assert.equal(plan.kind, "existing", "re-creating the range returns the closed period");
  if (plan.kind !== "existing") return;
  assert.equal(plan.period.id, "ordibehesht", "closed books must stay closed");
});

test("with every month closed a supplementary period is opened, not reused", () => {
  const shutOld = period({
    id: "farvardin",
    status: "closed",
    startsOn: "2026-03-21",
    endsOn: "2026-04-20",
  });
  const shutNow = period({
    id: "ordibehesht",
    status: "closed",
    startsOn: "2026-04-21",
    endsOn: "2026-05-21",
  });

  const plan = planAutoPeriod([shutOld, shutNow], "2026-04-05", "2026-05-02");
  assert.equal(plan.kind, "create");
  if (plan.kind !== "create") return;
  assert.notEqual(
    plan.idempotencyKey,
    autoPeriodIdempotencyKey(shutNow),
    "the auto key must not resolve back to the shut period",
  );
  assert.match(plan.range.title, /تکمیلی/);
  assert.ok(plan.range.startsOn <= "2026-05-02" && "2026-05-02" <= plan.range.endsOn);
});

test("only posted expenses reach the invoice total; drafts stay pending", () => {
  const buckets = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      visibility: "shared",
      title: "نهار",
      splits: [
        { userId: "a", amount: { amountMinor: "600", currency: "IRR" } },
        { userId: "b", amount: { amountMinor: "400", currency: "IRR" } },
      ],
    },
    {
      id: "e2",
      status: "submitted",
      visibility: "shared",
      title: "تاکسی",
      splits: [{ userId: "a", amount: { amountMinor: "250", currency: "IRR" } }],
    },
    {
      id: "e3",
      status: "reversed",
      visibility: "shared",
      title: "برگشتی",
      splits: [{ userId: "a", amount: { amountMinor: "9999", currency: "IRR" } }],
    },
  ]);

  const a = buckets.find((bucket) => bucket.memberUserId === "a");
  assert.equal(a?.totalMinor, 600n);
  assert.equal(a?.pendingMinor, 250n);
  assert.equal(a?.lines.length, 1);
  assert.equal(buckets.find((bucket) => bucket.memberUserId === "b")?.totalMinor, 400n);
});

test("private expenses land in the private total", () => {
  const [bucket] = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      visibility: "private",
      title: "دارو",
      splits: [{ userId: "a", amount: { amountMinor: "700", currency: "IRR" } }],
    },
  ]);
  assert.equal(bucket?.privateMinor, 700n);
  assert.equal(bucket?.sharedMinor, 0n);
  assert.equal(bucket?.totalMinor, 700n);
});

test("member filter keeps an empty bucket so a cleared invoice is detected", () => {
  const buckets = aggregateMemberInvoiceBuckets([], { memberUserIds: ["a", "b"] });
  assert.equal(buckets.length, 2);
  assert.ok(buckets.every((bucket) => bucket.totalMinor === 0n));
});

test("source hash ignores line order but tracks amounts", () => {
  const one = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      title: "الف",
      splits: [{ userId: "a", amount: { amountMinor: "100", currency: "IRR" } }],
    },
    {
      id: "e2",
      status: "posted",
      title: "ب",
      splits: [{ userId: "a", amount: { amountMinor: "200", currency: "IRR" } }],
    },
  ])[0]!;
  const flipped = aggregateMemberInvoiceBuckets([
    {
      id: "e2",
      status: "posted",
      title: "ب",
      splits: [{ userId: "a", amount: { amountMinor: "200", currency: "IRR" } }],
    },
    {
      id: "e1",
      status: "posted",
      title: "الف",
      splits: [{ userId: "a", amount: { amountMinor: "100", currency: "IRR" } }],
    },
  ])[0]!;
  assert.equal(invoiceSourceHash(one), invoiceSourceHash(flipped));

  const changed = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      title: "الف",
      splits: [{ userId: "a", amount: { amountMinor: "150", currency: "IRR" } }],
    },
  ])[0]!;
  assert.notEqual(invoiceSourceHash(one), invoiceSourceHash(changed));
});

test("a new pending amount refreshes the invoice but not its committed substance", () => {
  const committedOnly = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      title: "الف",
      splits: [{ userId: "a", amount: { amountMinor: "100", currency: "IRR" } }],
    },
  ])[0]!;
  const withPending = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      title: "الف",
      splits: [{ userId: "a", amount: { amountMinor: "100", currency: "IRR" } }],
    },
    {
      id: "e2",
      status: "draft",
      title: "ب",
      splits: [{ userId: "a", amount: { amountMinor: "300", currency: "IRR" } }],
    },
  ])[0]!;

  assert.equal(withPending.pendingMinor, 300n);
  assert.notEqual(
    invoiceSourceHash(committedOnly),
    invoiceSourceHash(withPending),
    "the stored pending figure must be rewritten",
  );
  assert.equal(
    invoiceCommittedHash(committedOnly),
    invoiceCommittedHash(withPending),
    "a draft must never mint a correction notice on a locked invoice",
  );
});

test("promoting a private cost to the company rewrites the document", () => {
  const asPrivate = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      title: "تاکسی",
      visibility: "private",
      splits: [{ userId: "a", amount: { amountMinor: "600", currency: "IRR" } }],
    },
  ])[0]!;
  const asCompany = aggregateMemberInvoiceBuckets([
    {
      id: "e1",
      status: "posted",
      title: "تاکسی",
      visibility: "company",
      splits: [{ userId: "a", amount: { amountMinor: "600", currency: "IRR" } }],
    },
  ])[0]!;

  assert.equal(asPrivate.privateMinor, 600n);
  assert.equal(asCompany.sharedMinor, 600n);
  assert.equal(asPrivate.totalMinor, asCompany.totalMinor, "the amount owed is the same");
  assert.notEqual(
    invoiceCommittedHash(asPrivate),
    invoiceCommittedHash(asCompany),
    "the shared/private figures moved, so the invoice must be rewritten",
  );
});

test("locked statuses are the ones a member already acted on", () => {
  assert.equal(isInvoiceLocked("draft"), false);
  assert.equal(isInvoiceLocked("pending_approval"), false);
  for (const status of ["approved", "issued", "paid", "disputed", "cancelled"] as const) {
    assert.equal(isInvoiceLocked(status), true);
  }
});

test("advanceRecurringNextRunOn uses Jalali months and clamps day", () => {
  assert.equal(advanceRecurringNextRunOn("2026-09-01", "weekly"), "2026-09-08");
  const farvardin31 = isoFromJalali(1403, 1, 31);
  const next = advanceRecurringNextRunOn(farvardin31, "monthly");
  const p = parseIsoToJalali(next);
  assert.ok(p);
  assert.equal(p.jm, 2);
  assert.equal(p.jd, 31);
  const esfandLen = jalaliMonthLength(1403, 12);
  const esfandLast = isoFromJalali(1403, 12, esfandLen);
  const afterEsfand = advanceRecurringNextRunOn(esfandLast, "monthly");
  const ny = parseIsoToJalali(afterEsfand);
  assert.ok(ny);
  assert.equal(ny.jy, 1404);
  assert.equal(ny.jm, 1);
  const yearly = advanceRecurringNextRunOn(farvardin31, "yearly");
  const y = parseIsoToJalali(yearly);
  assert.ok(y);
  assert.equal(y.jy, 1404);
  assert.equal(y.jm, 1);
  assert.equal(y.jd, 31);
});
