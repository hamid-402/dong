import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  allocatePercentSplit,
  allocateSharesSplit,
  buildStatementPack,
  buildStatementPackPrintHtml,
  statementPackToCsv,
  type ExpenseSummary,
} from "../src/index.js";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

test("buildStatementPack produces master + member sheets", () => {
  const total = { amountMinor: "10000", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, [alice, bob]);
  const expense: ExpenseSummary = {
    id: "e1",
    workspaceId,
    title: "نان مشترک",
    status: "posted",
    visibility: "shared",
    total,
    paidByUserId: alice,
    splitMethod: "equal",
    splits,
    participantUserIds: [alice, bob],
    paymentLines: [{ userId: alice, amount: total }],
    occurredOn: "2026-09-03",
    createdAt: new Date().toISOString(),
  };

  const pack = buildStatementPack({
    meta: {
      workspaceId,
      workspaceName: "گروه تست",
      spaceKindLabel: "گروه",
      from: "2026-09-01",
      to: "2026-09-05",
      documentNo: "STP-test",
      issuedAtIso: "2026-09-10T12:00:00.000Z",
      payoutInstructions: {
        holderName: "علی",
        destinationKind: "card",
        destinationValue: "6037991111111111",
      },
    },
    members: [
      { userId: alice, displayName: "علی" },
      { userId: bob, displayName: "بابک" },
    ],
    expenses: [expense],
  });

  assert.equal(pack.sheets.length, 3);
  assert.equal(pack.sheets[0]?.name, "جدول عمومی");
  assert.ok(pack.sheets.some((s) => s.name === "علی"));
  assert.ok(pack.sheets.some((s) => s.name === "بابک"));
  assert.equal(pack.details[1]?.payableMinor, "5000");

  const csv = statementPackToCsv(pack);
  assert.match(csv, /### جدول عمومی/);
  assert.match(csv, /قابل پرداخت/);
});

test("buildStatementPack weighted percent splits are not equal halves", () => {
  const total = { amountMinor: "100000", currency: "IRR" as const };
  const splits = allocatePercentSplit(total, [
    { userId: alice, percent: "7000" },
    { userId: bob, percent: "3000" },
  ]);
  const expense: ExpenseSummary = {
    id: "e-pct",
    workspaceId,
    title: "هزینه شرکت",
    status: "posted",
    visibility: "shared",
    total,
    paidByUserId: alice,
    splitMethod: "percent",
    splits,
    participantUserIds: [alice, bob],
    paymentLines: [{ userId: alice, amount: total }],
    occurredOn: "2026-09-04",
    createdAt: new Date().toISOString(),
  };

  const pack = buildStatementPack({
    meta: {
      workspaceId,
      workspaceName: "سازمان تست",
      spaceKindLabel: "سازمان",
      from: "2026-09-01",
      to: "2026-09-05",
      documentNo: "STP-pct",
      issuedAtIso: "2026-09-10T12:00:00.000Z",
    },
    members: [
      { userId: alice, displayName: "علی" },
      { userId: bob, displayName: "بابک" },
    ],
    expenses: [expense],
  });

  assert.equal(pack.details[0]?.totalShareMinor, "70000");
  assert.equal(pack.details[1]?.totalShareMinor, "30000");
  const aliceSheet = pack.sheets.find((s) => s.name === "علی");
  assert.ok(aliceSheet?.rows.some((r) => r.includes("مشترک / شرکت")));
});

test("buildStatementPack shares method weights member sheets", () => {
  const total = { amountMinor: "90000", currency: "IRR" as const };
  const splits = allocateSharesSplit(total, [
    { userId: alice, shares: 2 },
    { userId: bob, shares: 1 },
  ]);
  const expense: ExpenseSummary = {
    id: "e-sh",
    workspaceId,
    title: "شارژ ساختمان",
    status: "posted",
    visibility: "shared",
    total,
    paidByUserId: bob,
    splitMethod: "shares",
    splits,
    participantUserIds: [alice, bob],
    paymentLines: [{ userId: bob, amount: total }],
    occurredOn: "2026-09-02",
    createdAt: new Date().toISOString(),
  };

  const pack = buildStatementPack({
    meta: {
      workspaceId,
      workspaceName: "ساختمان الف",
      spaceKindLabel: "ساختمان",
      kindDocumentTitle: "صورتحساب شارژ ساختمان",
      letterheadNote: "واحد حسابداری ساختمان",
      footerNote: "این سند بر اساس دفتر روزانه صادر شده است.",
      from: "2026-09-01",
      to: "2026-09-05",
      documentNo: "BLD-1",
      issuedAtIso: "2026-09-10T12:00:00.000Z",
    },
    members: [
      { userId: alice, displayName: "علی" },
      { userId: bob, displayName: "بابک" },
    ],
    expenses: [expense],
  });

  assert.equal(pack.details[0]?.totalShareMinor, "60000");
  assert.equal(pack.details[1]?.totalShareMinor, "30000");
  const html = buildStatementPackPrintHtml(pack);
  assert.match(html, /صورتحساب شارژ ساختمان/);
  assert.match(html, /واحد حسابداری ساختمان/);
  assert.match(html, /دفتر روزانه/);
});

test("print HTML includes funding note for petty_cash lines", () => {
  const total = { amountMinor: "10000", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, [alice, bob]);
  const expense: ExpenseSummary = {
    id: "e-fund",
    workspaceId,
    title: "خرید از تنخواه",
    status: "posted",
    visibility: "shared",
    total,
    paidByUserId: alice,
    fundingSourceKind: "petty_cash",
    fundingRefId: "fund-main",
    splitMethod: "equal",
    splits,
    participantUserIds: [alice, bob],
    paymentLines: [{ userId: alice, amount: total }],
    occurredOn: "2026-09-03",
    createdAt: new Date().toISOString(),
  };
  const pack = buildStatementPack({
    meta: {
      workspaceId,
      workspaceName: "گروه تست",
      spaceKindLabel: "گروه",
      from: "2026-09-01",
      to: "2026-09-05",
      issuedAtIso: "2026-09-10T12:00:00.000Z",
    },
    members: [
      { userId: alice, displayName: "علی" },
      { userId: bob, displayName: "بابک" },
    ],
    expenses: [expense],
  });
  assert.ok(pack.details[0]?.lines[0]?.fundingNoteFa);
  const html = buildStatementPackPrintHtml(pack);
  assert.match(html, /fund-note/);
  assert.match(html, /صندوق تنخواه/);
  assert.match(html, /<th>منبع<\/th>/);
  const sheet = pack.sheets.find((s) => s.name === "علی");
  assert.ok(sheet?.rows.some((row) => row.includes("منبع / تسویه")));
  assert.ok(sheet?.rows.some((row) => row.includes("صندوق تنخواه")));
});
