import assert from "node:assert/strict";
import test from "node:test";
import { buildXlsxWorkbook } from "./xlsx-body.js";
import { readXlsxMatrices } from "./xlsx-read.js";

test("readXlsxMatrices roundtrips multi-sheet workbook", () => {
  const buf = buildXlsxWorkbook([
    {
      name: "جدول عمومی",
      rows: [
        ["ردیف", "روز", "تاریخ", "حمید", "قیمت", "شرکت", "قیمت6", "جمع"],
        ["1", "پنجشنبه", "1405/06/12", "چای", "5000", "نان", "20000", "25000"],
      ],
    },
    { name: "حمید", rows: [["قلم", "مبلغ"], ["چای", "5000"]] },
  ]);
  const sheets = readXlsxMatrices(Buffer.from(buf));
  assert.ok(sheets.length >= 1);
  const master = sheets.find((s) => /جدول|عمومی/.test(s.name)) ?? sheets[0]!;
  assert.equal(master.rows[0]?.[3], "حمید");
  assert.equal(master.rows[1]?.[4], "5000");
});
