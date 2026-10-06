import { writeFileSync } from "node:fs";
import { buildXlsxWorkbook } from "../src/reports/xlsx-body.ts";
import { readXlsxMatrices } from "../src/reports/xlsx-read.ts";
import { parseDongToMasterMatrix, resolveLedgerColumnTarget } from "@dang/contracts";
import { readFileSync } from "node:fs";

const buf = Buffer.from(
  buildXlsxWorkbook([
    {
      name: "جدول عمومی",
      rows: [
        ["ردیف", "تاریخ", "حمید", "قیمت", "شرکت", "قیمت6"],
        ["1", "1405/06/12", "چای", "5000", "نان", "20000"],
      ],
    },
  ]),
);
const sheets = readXlsxMatrices(buf);
const out: Record<string, unknown> = { generated: sheets };

try {
  const real = readFileSync(String.raw`C:\Users\hamid.kazemi\Desktop\دونگ تو.xlsx`);
  const realSheets = readXlsxMatrices(real);
  const master =
    realSheets.find((s) => /جدول|عمومی/.test(s.name)) ?? realSheets[0]!;
  const parsed = parseDongToMasterMatrix(master.rows);
  const members = [
    { userId: "1", displayName: "ساریخانی" },
    { userId: "2", displayName: "منتظری" },
    { userId: "3", displayName: "جلالی" },
    { userId: "4", displayName: "حمید" },
    { userId: "5", displayName: "محمدجواد" },
  ];
  const cols = [...new Set(parsed.rows.map((r) => r.column))];
  out.real = {
    sheetNames: realSheets.map((s) => s.name),
    rows: parsed.rows.length,
    cols,
    resolve: Object.fromEntries(
      cols.map((c) => [c, resolveLedgerColumnTarget(c, members)]),
    ),
  };
} catch (e) {
  out.realError = String(e);
}

writeFileSync(
  new URL("../../../.tmp-xlsx-smoke.json", import.meta.url),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log("wrote smoke json");
