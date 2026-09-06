import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateExpenseSpendInRange,
  countExpensesByStatus,
  defaultDashboardDateRange,
} from "../src/dashboard.js";

test("countExpensesByStatus aggregates statuses", () => {
  const counts = countExpensesByStatus([
    { status: "posted" },
    { status: "draft" },
    { status: "posted" },
    { status: "submitted" },
  ]);
  assert.equal(counts.posted, 2);
  assert.equal(counts.draft, 1);
  assert.equal(counts.submitted, 1);
  assert.equal(counts.reversed, undefined);
});

test("aggregateExpenseSpendInRange filters by occurredOn and sums posted", () => {
  const result = aggregateExpenseSpendInRange(
    [
      {
        status: "posted",
        occurredOn: "2026-03-10",
        total: { amountMinor: "1000", currency: "IRR" },
      },
      {
        status: "posted",
        occurredOn: "2026-02-01",
        total: { amountMinor: "5000", currency: "IRR" },
      },
      {
        status: "draft",
        occurredOn: "2026-03-15",
        total: { amountMinor: "2000", currency: "IRR" },
      },
      {
        status: "submitted",
        occurredOn: "2026-03-20",
        total: { amountMinor: "3000", currency: "IRR" },
      },
    ],
    "2026-03-01",
    "2026-03-31",
  );
  assert.equal(result.postedCount, 1);
  assert.equal(result.postedTotal.amountMinor, "1000");
  assert.equal(result.draftCount, 1);
  assert.equal(result.expenseCountByStatus.posted, 1);
  assert.equal(result.expenseCountByStatus.draft, 1);
  assert.equal(result.expenseCountByStatus.submitted, 1);
  assert.equal(result.expenseCountByStatus.reversed, undefined);
});

test("defaultDashboardDateRange uses UTC month start and today", () => {
  const range = defaultDashboardDateRange(new Date("2026-09-06T15:30:00.000Z"));
  assert.equal(range.from, "2026-09-01");
  assert.equal(range.to, "2026-09-06");
});
