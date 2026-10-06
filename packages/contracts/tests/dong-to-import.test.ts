import assert from "node:assert/strict";
import test from "node:test";
import {
  isoFromJalali,
  parseDongToMasterMatrix,
  parseDongToMemberSheet,
  parseDongToWorkbook,
  parseFlexibleLedgerDate,
  parseLedgerImportText,
  resolveLedgerColumnTarget,
} from "../src/index.js";

test("parseFlexibleLedgerDate accepts jalali and iso", () => {
  const iso = parseFlexibleLedgerDate("1405/06/12");
  assert.ok(iso);
  assert.equal(iso, isoFromJalali(1405, 6, 12));
  assert.equal(parseFlexibleLedgerDate("2026-09-03"), "2026-09-03");
});

test("parseDongToMasterMatrix extracts member + shared cells", () => {
  const matrix = [
    [
      "ردیف",
      "روز",
      "تاریخ",
      "حمید",
      "قیمت",
      "شرکت",
      "قیمت6",
      "جمع کل (تومان)",
    ],
    ["1", "پنجشنبه", "1405/06/12", "چای", "5000", "نان", "20000", "25000"],
    ["2", "جمعه", "1405/06/13", "تعطیل", "تعطیل", "تعطیل", "تعطیل", "تعطیل"],
    ["3", "شنبه", "1405/06/14", "-", "-", "ماست", "350000", "350000"],
  ];
  const result = parseDongToMasterMatrix(matrix);
  assert.equal(result.holidays.length, 1);
  assert.ok(result.rows.some((r) => r.column === "حمید" && r.itemName === "چای" && r.amountToman === 5000));
  assert.ok(result.rows.some((r) => r.column === "shared" && r.itemName === "نان"));
  assert.ok(result.rows.some((r) => r.column === "shared" && r.itemName === "ماست"));
});

test("parseLedgerImportText accepts TSV paste of Dong-To header", () => {
  const text = [
    "ردیف\tروز\tتاریخ\tعلی\tقیمت\tشرکت\tقیمت2\tجمع",
    "1\tپنجشنبه\t1405/06/12\tچای\t1000\tنان\t2000\t3000",
  ].join("\n");
  const result = parseLedgerImportText(text);
  assert.equal(result.rows.length, 2);
});

test("parseLedgerImportText accepts long CSV format", () => {
  const text = "date_iso,column,item_name,amount_toman\n2026-09-12,حمید,چای,5000\n";
  const result = parseLedgerImportText(text);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.column, "حمید");
});

test("resolveLedgerColumnTarget fuzzy + columnMap", () => {
  const members = [
    { userId: "u1", displayName: "حمید کاظمی" },
    { userId: "u2", displayName: "آقای ساریخانی" },
  ];
  assert.equal(resolveLedgerColumnTarget("شرکت", members).kind, "shared");
  assert.equal(resolveLedgerColumnTarget("حمید", members).kind, "member");
  assert.equal(
    (resolveLedgerColumnTarget("آقای ساریخانی", members) as { userId: string }).userId,
    "u2",
  );
  assert.equal(resolveLedgerColumnTarget("ناشناس", members).kind, "unmapped");
  assert.equal(
    resolveLedgerColumnTarget("ناشناس", members, { ناشناس: "skip" }).kind,
    "skip",
  );
  assert.equal(
    (resolveLedgerColumnTarget("ناشناس", members, { ناشناس: "u1" }) as { userId: string })
      .userId,
    "u1",
  );
});

test("parseDongToMemberSheet converts rial personal + shared company lines", () => {
  const matrix = [
    [
      "ردیف",
      "روز",
      "تاریخ",
      "نام کالا",
      "قیمت(ریال)",
      "نام کالا برای شرکت",
      "قیمت2(ريال)",
    ],
    ["1", "پنجشنبه", "1405/06/12", "چای", "50000", "نان", "200000"],
    ["2", "جمعه", "1405/06/13", "تعطیل", "تعطیل", "تعطیل", "تعطیل"],
    ["3", "شنبه", "1405/06/14", "-", "-", "ماست", "100000"],
  ];
  const result = parseDongToMemberSheet(matrix, "داود");
  assert.equal(result.holidays.length, 1);
  assert.ok(
    result.rows.some(
      (r) => r.column === "داود" && r.itemName === "چای" && r.amountToman === 5000,
    ),
  );
  assert.ok(
    result.rows.some(
      (r) => r.column === "shared" && r.itemName === "نان" && r.amountToman === 20000,
    ),
  );
  assert.ok(
    result.rows.some(
      (r) => r.column === "shared" && r.itemName === "ماست" && r.amountToman === 10000,
    ),
  );
});

test("parseDongToWorkbook members source merges sheets and dedupes shared", () => {
  const header = [
    "ردیف",
    "روز",
    "تاریخ",
    "نام کالا",
    "قیمت(تومان)",
    "نام کالا برای شرکت",
    "قیمت2",
  ];
  const sheets = [
    {
      name: "علی",
      rows: [
        header,
        ["1", "شنبه", "1405/06/14", "چای", "1000", "نان", "5000"],
      ],
    },
    {
      name: "بابک",
      rows: [
        header,
        ["1", "شنبه", "1405/06/14", "شیر", "2000", "نان", "5000"],
      ],
    },
  ];
  const result = parseDongToWorkbook(sheets, { source: "members" });
  assert.equal(result.rows.filter((r) => r.column === "shared").length, 1);
  assert.ok(result.rows.some((r) => r.column === "علی" && r.itemName === "چای"));
  assert.ok(result.rows.some((r) => r.column === "بابک" && r.itemName === "شیر"));
});
