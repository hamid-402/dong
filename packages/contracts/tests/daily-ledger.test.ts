import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyLedgerCsv,
  buildDailyLedgerMatrix,
  eachDateInclusive,
  formatJalaliIso,
  isoFromJalali,
  parseDailyLedgerImportCsv,
  resolveDailyLedgerRange,
  shiftDailyLedgerRange,
} from "../src/daily-ledger.js";

test("eachDateInclusive spans inclusive days", () => {
  assert.deepEqual(eachDateInclusive("2026-09-01", "2026-09-03"), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
});

test("resolveDailyLedgerRange uses Jalali month and Sat–Fri week", () => {
  const anchor = new Date("2026-09-05T12:00:00Z"); // شنبه = شروع هفته شمسی
  const month = resolveDailyLedgerRange("month", anchor);
  assert.equal(month.from, "2026-08-23");
  assert.equal(month.to, "2026-09-22");
  const week = resolveDailyLedgerRange("week", anchor);
  assert.equal(week.from, "2026-09-05");
  assert.equal(week.to, "2026-09-11");
  const days = resolveDailyLedgerRange("days", anchor, { from: "", to: "", days: 3 });
  assert.equal(days.to, "2026-09-05");
  assert.equal(days.from, "2026-09-03");
});

test("shiftDailyLedgerRange moves Jalali week and month", () => {
  const week = resolveDailyLedgerRange("week", new Date("2026-09-05T12:00:00Z"));
  const prev = shiftDailyLedgerRange("week", week.from, week.to, -1);
  assert.equal(prev.from, "2026-08-29");
  assert.equal(prev.to, "2026-09-04");
  const month = resolveDailyLedgerRange("month", new Date("2026-09-05T12:00:00Z"));
  const nextMonth = shiftDailyLedgerRange("month", month.from, month.to, 1);
  assert.equal(nextMonth.from, "2026-09-23");
  assert.equal(nextMonth.to, "2026-10-22");
});

test("buildDailyLedgerMatrix puts single-split shared into member column", () => {
  const matrix = buildDailyLedgerMatrix({
    workspaceId: "w1",
    from: "2026-09-12",
    to: "2026-09-12",
    members: [
      { userId: "u1", displayName: "حمید" },
      { userId: "u2", displayName: "جواد" },
    ],
    expenses: [
      {
        id: "e1",
        title: "لیموناد بطری",
        status: "posted",
        visibility: "shared",
        occurredOn: "2026-09-12",
        total: { amountMinor: "600000", currency: "IRR" },
        splits: [{ userId: "u1", amount: { amountMinor: "600000", currency: "IRR" } }],
        participantUserIds: ["u1"],
        source: "daily_ledger",
      },
      {
        id: "e2",
        title: "آب معدنی",
        status: "posted",
        visibility: "company",
        occurredOn: "2026-09-12",
        total: { amountMinor: "100000", currency: "IRR" },
        splits: [
          { userId: "u1", amount: { amountMinor: "50000", currency: "IRR" } },
          { userId: "u2", amount: { amountMinor: "50000", currency: "IRR" } },
        ],
        participantUserIds: ["u1", "u2"],
        source: "daily_ledger",
      },
    ],
    dayMeta: [],
    expensePersistence: "memory",
    dayMetaPersistence: "memory",
  });
  assert.equal(matrix.days.length, 1);
  assert.equal(matrix.days[0]?.members.u1?.items[0]?.title, "لیموناد بطری");
  assert.equal(matrix.days[0]?.shared.items[0]?.title, "آب معدنی");
  assert.equal(matrix.totals.grand.amountMinor, "700000");
});

test("formatJalaliIso converts known Gregorian date", () => {
  assert.equal(formatJalaliIso("2026-09-05"), "1405/06/14");
  assert.equal(isoFromJalali(1405, 6, 14), "2026-09-05");
});

test("buildDailyLedgerCsv includes jalali and totals", () => {
  const matrix = buildDailyLedgerMatrix({
    workspaceId: "w1",
    from: "2026-09-12",
    to: "2026-09-12",
    members: [{ userId: "u1", displayName: "حمید" }],
    expenses: [
      {
        id: "e1",
        title: "چای",
        status: "posted",
        visibility: "shared",
        occurredOn: "2026-09-12",
        total: { amountMinor: "10000", currency: "IRR" },
        splits: [{ userId: "u1", amount: { amountMinor: "10000", currency: "IRR" } }],
        participantUserIds: ["u1"],
        source: "daily_ledger",
      },
    ],
    dayMeta: [{ date: "2026-09-12", isHoliday: false }],
    expensePersistence: "memory",
    dayMetaPersistence: "memory",
  });
  const csv = buildDailyLedgerCsv(matrix);
  assert.match(csv, /date_jalali/);
  assert.match(csv, /1405/);
  assert.match(csv, /TOTAL/);
  assert.match(csv, /چای/);
});

test("parseDailyLedgerImportCsv reads rows", () => {
  const rows = parseDailyLedgerImportCsv(
    "date_iso,column,item_name,amount_toman\n2026-09-12,حمید,چای,5000\n2026-09-12,shared,نان,20000\n",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.itemName, "چای");
  assert.equal(rows[1]?.column, "shared");
  assert.equal(rows[1]?.amountToman, 20000);
});

test("buildDailyLedgerMatrix marks range-locked days", () => {
  const matrix = buildDailyLedgerMatrix({
    workspaceId: "w1",
    from: "2026-09-12",
    to: "2026-09-13",
    members: [{ userId: "u1", displayName: "حمید" }],
    expenses: [],
    dayMeta: [],
    rangeLocks: [
      {
        id: "l1",
        workspaceId: "w1",
        from: "2026-09-12",
        to: "2026-09-12",
        lockedByUserId: "u1",
        lockedAt: "2026-09-12T00:00:00Z",
        active: true,
      },
    ],
    canManageLocks: true,
    expensePersistence: "memory",
    dayMetaPersistence: "memory",
  });
  assert.equal(matrix.days[0]?.isRangeLocked, true);
  assert.equal(matrix.days[1]?.isRangeLocked, false);
  assert.equal(matrix.canManageLocks, true);
});
