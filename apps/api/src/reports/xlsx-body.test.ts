import assert from "node:assert/strict";
import test from "node:test";
import { buildXlsxSpreadsheet, buildXlsxWorkbook } from "./xlsx-body.js";

test("G07 buildXlsxSpreadsheet produces ZIP with sheet1", () => {
  const buf = buildXlsxSpreadsheet([
    ["date", "title"],
    ["2026-09-01", "test"],
  ]);
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
  const text = buf.toString("latin1");
  assert.ok(text.includes("xl/worksheets/sheet1.xml"));
});

test("buildXlsxWorkbook multi-sheet includes sheet2", () => {
  const buf = buildXlsxWorkbook([
    { name: "جدول عمومی", rows: [["a", "b"]] },
    { name: "علی", rows: [["c"]] },
  ]);
  const text = buf.toString("latin1");
  assert.ok(text.includes("xl/worksheets/sheet1.xml"));
  assert.ok(text.includes("xl/worksheets/sheet2.xml"));
});
