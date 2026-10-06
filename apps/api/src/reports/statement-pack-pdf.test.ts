import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  buildStatementPack,
  type ExpenseSummary,
} from "@dang/contracts";
import {
  buildStatementPackPdf,
  rtlVisual,
  statementPackPdfFontAvailable,
} from "./statement-pack-pdf.js";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const alice = "11111111-1111-4111-8111-111111111111";

test("rtlVisual reverses Persian runs and keeps digits", () => {
  assert.equal(rtlVisual("abc"), "abc");
  assert.ok(rtlVisual("سلام").length === 4);
  assert.match(rtlVisual("قلم 12"), /12/);
  assert.match(rtlVisual("مبلغ ۵۰۰"), /۵۰۰/);
  assert.equal(rtlVisual("۵۰۰"), "۵۰۰");
});

test("buildStatementPackPdf uses Jalali dates and Vazir when available", async () => {
  assert.equal(statementPackPdfFontAvailable(), true);
  const total = { amountMinor: "10000", currency: "IRR" as const };
  const expense: ExpenseSummary = {
    id: "e1",
    workspaceId,
    title: "نان",
    status: "posted",
    visibility: "shared",
    total,
    paidByUserId: alice,
    splitMethod: "equal",
    splits: allocateEqualSplit(total, [alice]),
    participantUserIds: [alice],
    paymentLines: [{ userId: alice, amount: total }],
    occurredOn: "2026-09-03",
    createdAt: new Date().toISOString(),
  };
  const pack = buildStatementPack({
    meta: {
      workspaceId,
      workspaceName: "تست",
      spaceKindLabel: "گروه",
      from: "2026-09-01",
      to: "2026-09-05",
      documentNo: "STP-pdf",
      issuedAtIso: "2026-09-10T12:00:00.000Z",
      kindDocumentTitle: "صورتحساب گروه",
      letterheadNote: "حسابداری",
      footerNote: "سند رسمی دنگ",
    },
    members: [{ userId: alice, displayName: "علی" }],
    expenses: [expense],
  });
  const buf = await buildStatementPackPdf(pack);
  assert.ok(buf.length > 100);
  assert.equal(buf.subarray(0, 4).toString("latin1"), "%PDF");
  // Embedded content stream should not keep Gregorian ISO date for the line.
  const asLatin = buf.toString("latin1");
  assert.equal(asLatin.includes("2026-09-03"), false);
});
