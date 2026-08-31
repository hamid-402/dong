import {
  assertReportCategoriesSeparated,
  buildMemberReportExport,
  formatMemberReportCsv,
  type MemberAccountReport,
} from "../src/partnership.js";
import { test } from "node:test";
import assert from "node:assert/strict";

const sample: MemberAccountReport = {
  workspaceId: "ws-1",
  memberUserId: "u-1",
  displayName: "علی",
  lines: [
    {
      category: "contribution",
      label: "آورده نقدی",
      amountMinor: "1000000",
      currency: "IRR",
    },
    {
      category: "loan",
      label: "قرض دریافت‌شده",
      amountMinor: "200000",
      currency: "IRR",
    },
    {
      category: "withdrawal",
      label: "برداشت",
      amountMinor: "50000",
      currency: "IRR",
    },
  ],
  netPositionMinor: "750000",
};

test("CSV export keeps categories in separate rows", () => {
  const csv = formatMemberReportCsv(sample);
  assert.match(csv, /contribution/);
  assert.match(csv, /loan/);
  assert.match(csv, /withdrawal/);
  assert.match(csv, /net/);
  assert.equal(csv.split("\r\n")[0], "category,label,amount_minor_irr,currency");
});

test("buildMemberReportExport returns excel-friendly mime", () => {
  const payload = buildMemberReportExport(sample);
  assert.equal(payload.format, "csv");
  assert.equal(payload.mimeType, "text/csv; charset=utf-8");
  assert.match(payload.filename, /\.csv$/);
});

test("assertReportCategoriesSeparated accepts clean report", () => {
  assert.doesNotThrow(() => assertReportCategoriesSeparated(sample));
});
