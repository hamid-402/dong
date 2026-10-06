import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllocationPercents,
  buildMonthLifestyleSnapshot,
  buildPersonalAnnualStatementPack,
  DEFAULT_ALLOCATION_PERCENTS,
  envelopeMinor,
  normalizeAllocationPercents,
  personalAnnualStatementToCsv,
  spaceKindToLifeDomain,
} from "../src/personal-lifestyle.js";

test("default allocation sums to 100", () => {
  assertAllocationPercents(DEFAULT_ALLOCATION_PERCENTS);
  const n = normalizeAllocationPercents(null);
  assert.equal(n.savings, 30);
  assert.equal(n.solo, 40);
});

test("assertAllocationPercents rejects bad sum", () => {
  assert.throws(
    () =>
      assertAllocationPercents({
        solo: 50,
        group: 40,
        building: 0,
        org: 0,
        savings: 0,
      }),
    /ALLOCATION_SUM/,
  );
});

test("spaceKindToLifeDomain maps templates", () => {
  assert.equal(spaceKindToLifeDomain("personal"), "solo");
  assert.equal(spaceKindToLifeDomain("group"), "group");
  assert.equal(spaceKindToLifeDomain("building"), "building");
  assert.equal(spaceKindToLifeDomain("org"), "org");
});

test("buildMonthLifestyleSnapshot closes when income = save + spend", () => {
  const income = 3_000_000n;
  const save = envelopeMinor(income, 30);
  const spendSolo = envelopeMinor(income, 40);
  const spendGroup = envelopeMinor(income, 15);
  const spendBuilding = envelopeMinor(income, 10);
  const spendOrg = envelopeMinor(income, 5);
  const snap = buildMonthLifestyleSnapshot({
    yearMonth: "1405-06",
    from: "2026-08-23",
    to: "2026-09-22",
    percents: DEFAULT_ALLOCATION_PERCENTS,
    paycheckAmountsMinor: [income],
    spendByDomain: {
      solo: spendSolo,
      group: spendGroup,
      building: spendBuilding,
      org: spendOrg,
    },
    savingsContributedMinor: save,
    persistence: {
      paychecks: "memory",
      workspaces: "memory",
      personal: "memory",
      savings: "memory",
    },
    toleranceMinor: 10n,
  });
  assert.equal(snap.paycheckCount, 1);
  assert.equal(snap.balanced, true);
  assert.equal(snap.emptyReason, undefined);
  assert.equal(BigInt(snap.incomeTotal.amountMinor), income);
  assert.equal(
    BigInt(snap.savingsTotal.amountMinor) + BigInt(snap.lifestyleSpendTotal.amountMinor),
    income,
  );
});

test("buildMonthLifestyleSnapshot empty without paycheck", () => {
  const snap = buildMonthLifestyleSnapshot({
    yearMonth: "1405-06",
    from: "2026-08-23",
    to: "2026-09-22",
    percents: DEFAULT_ALLOCATION_PERCENTS,
    paycheckAmountsMinor: [],
    spendByDomain: {},
    savingsContributedMinor: 0n,
    persistence: {
      paychecks: "memory",
      workspaces: "memory",
      personal: "memory",
      savings: "memory",
    },
  });
  assert.ok(snap.emptyReason);
  assert.equal(snap.balanced, false);
});

test("annual pack csv includes domain header", () => {
  const month = buildMonthLifestyleSnapshot({
    yearMonth: "1405-01",
    from: "2026-03-21",
    to: "2026-04-20",
    percents: DEFAULT_ALLOCATION_PERCENTS,
    paycheckAmountsMinor: [1_000_000n],
    spendByDomain: { solo: 400_000n, group: 150_000n, building: 100_000n, org: 50_000n },
    savingsContributedMinor: 300_000n,
    persistence: {
      paychecks: "memory",
      workspaces: "memory",
      personal: "memory",
      savings: "memory",
    },
  });
  const pack = buildPersonalAnnualStatementPack({
    jalaliYear: 1405,
    from: "2026-03-21",
    to: "2027-03-20",
    displayName: "حمید",
    issuedAtIso: "2026-09-24T12:00:00.000Z",
    months: [month],
    goals: [
      {
        name: "صندوق",
        target: { amountMinor: "10000000", currency: "IRR" },
        contributed: { amountMinor: "300000", currency: "IRR" },
        progressPercent: 3,
        status: "active",
      },
    ],
  });
  const csv = personalAnnualStatementToCsv(pack);
  assert.match(csv, /سال شمسی,1405/);
  assert.match(csv, /شخصی \(تنها\)/);
});
