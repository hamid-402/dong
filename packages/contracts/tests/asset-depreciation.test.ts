import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDepreciationTick,
  monthlyDepreciationMinor,
  sameCalendarMonth,
} from "../src/asset-depreciation.js";

const cost = (amountMinor: string) => ({ amountMinor, currency: "IRR" as const });

test("monthlyDepreciationMinor is straight-line with integer division", () => {
  assert.equal(monthlyDepreciationMinor(1300n, 100n, 12), 100n);
  assert.equal(monthlyDepreciationMinor(1000n, 0n, 3), 333n);
  assert.equal(monthlyDepreciationMinor(1000n, 0n, 0), 0n);
  assert.equal(monthlyDepreciationMinor(1000n, 0n, -4), 0n);
  assert.equal(monthlyDepreciationMinor(100n, 100n, 5), 0n);
  assert.equal(monthlyDepreciationMinor(100n, 500n, 5), 0n);
});

test("sameCalendarMonth compares YYYY-MM prefixes", () => {
  assert.equal(sameCalendarMonth("2026-03-01", "2026-03-31T23:59:59Z"), true);
  assert.equal(sameCalendarMonth("2026-03-31", "2026-04-01"), false);
  assert.equal(sameCalendarMonth("2025-03-10", "2026-03-10"), false);
});

test("computeDepreciationTick skips with explicit reasons", () => {
  const ok = {
    acquisitionCost: cost("1200"),
    usefulLifeMonths: 12,
    status: "active",
    asOfIso: "2026-03-15T00:00:00Z",
  };
  assert.deepEqual(computeDepreciationTick({ ...ok, status: "disposed" }), {
    skipped: true,
    reason: "not_active",
  });
  assert.deepEqual(computeDepreciationTick({ ...ok, usefulLifeMonths: undefined }), {
    skipped: true,
    reason: "no_useful_life",
  });
  assert.deepEqual(computeDepreciationTick({ ...ok, usefulLifeMonths: 0 }), {
    skipped: true,
    reason: "no_useful_life",
  });
  assert.deepEqual(computeDepreciationTick({ ...ok, acquisitionCost: cost("0") }), {
    skipped: true,
    reason: "no_cost",
  });
  assert.deepEqual(computeDepreciationTick({ ...ok, lastDepreciatedOn: "2026-03-01" }), {
    skipped: true,
    reason: "same_month",
  });
  assert.deepEqual(computeDepreciationTick({ ...ok, salvageMinor: "1200" }), {
    skipped: true,
    reason: "zero_depreciation",
  });
  assert.deepEqual(
    computeDepreciationTick({ ...ok, accumulatedDepreciationMinor: "1200" }),
    { skipped: true, reason: "fully_depreciated" },
  );
});

test("computeDepreciationTick adds one month and records the day", () => {
  const r = computeDepreciationTick({
    acquisitionCost: cost("1200"),
    usefulLifeMonths: 12,
    status: "active",
    asOfIso: "2026-03-15T08:00:00Z",
    lastDepreciatedOn: "2026-02-15",
    accumulatedDepreciationMinor: "100",
  });
  assert.deepEqual(r, {
    skipped: false,
    addMinor: 100n,
    nextAccumulatedMinor: 200n,
    lastDepreciatedOn: "2026-03-15",
  });
});

test("computeDepreciationTick caps at depreciable base (cost - salvage)", () => {
  const r = computeDepreciationTick({
    acquisitionCost: cost("1000"),
    salvageMinor: "200",
    usefulLifeMonths: 2,
    status: "active",
    asOfIso: "2026-05-01",
    accumulatedDepreciationMinor: "700",
  });
  assert.equal(r.skipped, false);
  if (!r.skipped) {
    assert.equal(r.addMinor, 100n);
    assert.equal(r.nextAccumulatedMinor, 800n);
  }
});
