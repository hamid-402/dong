import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMemberStatementDetail,
  buildMemberStatementLines,
  parseMinorBigInt,
  statementDetailToCsv,
  statementDetailToJson,
  statementLinesToCsv,
  statementZeroSumHolds,
  sumStatementShareMinor,
  summarizeMemberStatement,
} from "../src/statements.js";
import type { ExpenseSummary } from "../src/finance.js";

const ws = "ws-1";
const a = "user-a";
const b = "user-b";
const c = "user-c";
const irr = (amountMinor: string) => ({ amountMinor, currency: "IRR" as const });

function expense(over: Record<string, unknown>): ExpenseSummary {
  return {
    id: "e1",
    workspaceId: ws,
    title: "Dinner",
    status: "posted",
    visibility: "shared",
    paidByUserId: a,
    occurredOn: "2026-03-03",
    createdAt: "2026-03-03T00:00:00Z",
    participantUserIds: [a, b],
    ...over,
  } as unknown as ExpenseSummary;
}

const tipExpense = expense({
  id: "e-tip",
  total: irr("1100"),
  splitMethod: "itemized",
  tip: irr("100"),
  paymentLines: [{ userId: a, amount: irr("1100") }],
  items: [
    { title: "Pizza", amount: irr("600"), assigneeUserIds: [a, b], catalogItemId: "cat1", unitCode: "pcs", quantity: 2, unitPriceMinor: "300" },
    { title: "  ", amount: irr("400"), assigneeUserIds: [b] },
  ],
  splits: [
    { userId: a, amount: irr("350") },
    { userId: b, amount: irr("750") },
  ],
});

test("parseMinorBigInt is forgiving about malformed input", () => {
  assert.equal(parseMinorBigInt(5n), 5n);
  assert.equal(parseMinorBigInt(null), 0n);
  assert.equal(parseMinorBigInt(undefined), 0n);
  assert.equal(parseMinorBigInt(" 42 "), 42n);
  assert.equal(parseMinorBigInt(-7), -7n);
  assert.equal(parseMinorBigInt("1.5"), 0n);
  assert.equal(parseMinorBigInt("abc"), 0n);
  assert.equal(parseMinorBigInt(""), 0n);
});

test("itemized expense yields one line per assigned item plus a tip adjustment", () => {
  const lines = buildMemberStatementLines(tipExpense, b, "2026-03-01", "2026-03-31");
  assert.equal(lines.length, 3);

  const [pizza, untitled, adj] = lines;
  assert.equal(pizza!.itemName, "Pizza");
  assert.equal(pizza!.shareMinor, "300");
  assert.equal(pizza!.shareRatio, "0.500000");
  assert.equal(pizza!.catalogItemId, "cat1");
  assert.equal(pizza!.quantity, 2);
  assert.equal(pizza!.unitPriceMinor, "300");
  assert.equal(pizza!.paidBy, a);

  assert.equal(untitled!.itemName, "Dinner"); // blank item title falls back to expense title
  assert.equal(untitled!.shareMinor, "400");
  assert.equal(untitled!.shareRatio, "1.000000");

  assert.equal(adj!.shareMinor, "50");
  assert.equal(adj!.totalMinor, "100");
  assert.equal(adj!.shareRatio, "0.500000");
  assert.match(adj!.itemName, /Dinner$/);
  assert.equal(sumStatementShareMinor(lines), 750n);

  const aLines = buildMemberStatementLines(tipExpense, a, "2026-03-01", "2026-03-31");
  assert.deepEqual(aLines.map((l) => l.shareMinor), ["300", "50"]);
});

test("itemized discount produces a negative adjustment line", () => {
  const e = expense({
    id: "e-disc",
    total: irr("500"),
    splitMethod: "itemized",
    discount: irr("100"),
    items: [{ title: "Pizza", amount: irr("600"), assigneeUserIds: [a, b] }],
    splits: [
      { userId: a, amount: irr("250") },
      { userId: b, amount: irr("250") },
    ],
  });
  const lines = buildMemberStatementLines(e, b, "2026-03-01", "2026-03-31");
  assert.deepEqual(lines.map((l) => l.shareMinor), ["300", "-50"]);
  const adj = lines[1]!;
  assert.equal(adj.totalMinor, "100");
  assert.equal(adj.shareRatio, "0.500000");
  assert.notEqual(adj.itemName, lines[0]!.itemName);
  assert.equal(sumStatementShareMinor(lines), 250n);
});

test("adjustment falls back to expense total for ratio when no tip/tax/discount explain the drift", () => {
  const e = expense({
    id: "e-drift",
    total: irr("1000"),
    splitMethod: "itemized",
    items: [{ title: "Only", amount: irr("800"), assigneeUserIds: [a, b] }],
    splits: [
      { userId: a, amount: irr("500") },
      { userId: b, amount: irr("500") },
    ],
  });
  const lines = buildMemberStatementLines(e, b, "2026-03-01", "2026-03-31");
  assert.equal(lines.length, 2);
  assert.equal(lines[1]!.shareMinor, "100");
  assert.equal(lines[1]!.totalMinor, "1000");
  assert.equal(lines[1]!.shareRatio, "0.100000");
});

test("item shares are weighted and remainders go to the first assignees", () => {
  const weighted = expense({
    id: "e-w",
    total: irr("1000"),
    splitMethod: "itemized",
    items: [{ title: "Cake", amount: irr("1000"), assigneeUserIds: [a, b], sharesByUserId: { [a]: 3, [b]: 1 } }],
    splits: [
      { userId: a, amount: irr("750") },
      { userId: b, amount: irr("250") },
    ],
  });
  assert.deepEqual(buildMemberStatementLines(weighted, a, "2026-03-01", "2026-03-31").map((l) => l.shareMinor), ["750"]);
  assert.deepEqual(buildMemberStatementLines(weighted, b, "2026-03-01", "2026-03-31").map((l) => l.shareMinor), ["250"]);

  const odd = expense({
    id: "e-odd",
    total: irr("100"),
    splitMethod: "itemized",
    participantUserIds: [a, b, c],
    items: [{ title: "Snack", amount: irr("100"), assigneeUserIds: [a, b, c] }],
    splits: [
      { userId: a, amount: irr("34") },
      { userId: b, amount: irr("33") },
      { userId: c, amount: irr("33") },
    ],
  });
  const shares = [a, b, c].map((u) => buildMemberStatementLines(odd, u, "2026-03-01", "2026-03-31")[0]!.shareMinor);
  assert.deepEqual(shares, ["34", "33", "33"]);
});

test("lines are skipped for non-participants, out-of-range and non-posted expenses", () => {
  assert.deepEqual(buildMemberStatementLines(tipExpense, c, "2026-03-01", "2026-03-31"), []);
  assert.deepEqual(buildMemberStatementLines(tipExpense, b, "2026-04-01", "2026-04-30"), []);
  assert.deepEqual(
    buildMemberStatementLines({ ...tipExpense, status: "draft" } as ExpenseSummary, b, "2026-03-01", "2026-03-31"),
    [],
  );
  // payer with zero share is not listed as a line
  const paidOnly = expense({
    id: "e-paid",
    total: irr("100"),
    splitMethod: "equal",
    paymentLines: [{ userId: c, amount: irr("100") }],
    paidByUserId: c,
    splits: [{ userId: a, amount: irr("100") }],
  });
  assert.deepEqual(buildMemberStatementLines(paidOnly, c, "2026-03-01", "2026-03-31"), []);
});

test("detail sorts lines by date then expense id and reconciles zero-sum", () => {
  const early = expense({
    id: "z-early",
    occurredOn: "2026-03-01",
    total: irr("200"),
    splitMethod: "equal",
    paymentLines: [{ userId: a, amount: irr("200") }],
    splits: [
      { userId: a, amount: irr("100") },
      { userId: b, amount: irr("100") },
    ],
  });
  const sameDayA = expense({
    id: "a-same",
    total: irr("200"),
    occurredOn: "2026-03-03",
    splitMethod: "equal",
    paymentLines: [{ userId: a, amount: irr("200") }],
    splits: [
      { userId: a, amount: irr("100") },
      { userId: b, amount: irr("100") },
    ],
  });
  const expenses = [tipExpense, sameDayA, early];
  const detail = buildMemberStatementDetail({
    workspaceId: ws,
    userId: b,
    from: "2026-03-01",
    to: "2026-03-31",
    expenses,
  });
  assert.deepEqual(
    detail.lines.map((l) => `${l.date}/${l.expenseId}`),
    [
      "2026-03-01/z-early",
      "2026-03-03/a-same",
      "2026-03-03/e-tip",
      "2026-03-03/e-tip",
      "2026-03-03/e-tip",
    ],
  );
  assert.equal(detail.totalShareMinor, "950");
  assert.equal(detail.zeroSumOk, true);
  assert.equal(statementZeroSumHolds(expenses, b, "2026-03-01", "2026-03-31", detail.lines), true);
  assert.equal(statementZeroSumHolds(expenses, b, "2026-03-01", "2026-03-31", detail.lines.slice(1)), false);
});

test("summarizeMemberStatement groups per day only for day granularity", () => {
  const detail = buildMemberStatementDetail({
    workspaceId: ws,
    userId: b,
    from: "2026-03-01",
    to: "2026-03-31",
    expenses: [tipExpense],
  });
  const period = summarizeMemberStatement(detail, "period");
  assert.equal(period.days, undefined);
  assert.equal(period.lineCount, 3);
  assert.equal(period.payableMinor, "750");
  assert.equal(period.creditMinor, "0");

  const day = summarizeMemberStatement(detail, "day");
  assert.deepEqual(day.days, [{ date: "2026-03-03", shareMinor: "750", lineCount: 3 }]);
  assert.equal(day.granularity, "day");
});

test("statement CSV/JSON exports escape fields and describe payout state", () => {
  const detail = buildMemberStatementDetail({
    workspaceId: ws,
    userId: b,
    from: "2026-03-01",
    to: "2026-03-31",
    expenses: [expense({
      id: "e-csv",
      title: 'Lunch, "big"',
      total: irr("100"),
      splitMethod: "equal",
      quantity: 2,
      paymentLines: [{ userId: a, amount: irr("100") }],
      splits: [{ userId: b, amount: irr("100") }],
    })],
  });
  const linesCsv = statementLinesToCsv(detail.lines);
  const [header, row] = linesCsv.split("\n");
  assert.ok(header!.startsWith("date,weekdayFa,itemName,"));
  assert.ok(row!.includes('"Lunch, ""big"""'));
  assert.ok(row!.includes(",2,")); // quantity column
  assert.equal(statementLinesToCsv([]), header);

  const unset = statementDetailToCsv(detail);
  assert.ok(unset.endsWith("# payoutInstructions=unset\n"));
  assert.ok(unset.includes("# zeroSumOk=true"));

  const withBank = statementDetailToCsv({
    ...detail,
    payoutInstructions: { holderName: "Ali", destinationKind: "iban", destinationValue: "IR27", bankName: "Melli" },
  });
  assert.ok(withBank.includes("# payout.bankName=Melli"));
  assert.ok(!withBank.includes("payoutInstructions=unset"));

  const noBank = statementDetailToCsv({
    ...detail,
    payoutInstructions: { holderName: "Ali", destinationKind: "card", destinationValue: "6037997188123450" },
  });
  assert.ok(!noBank.includes("payout.bankName"));

  const json = statementDetailToJson(detail);
  assert.ok(json.endsWith("}\n"));
  assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(detail)));
});
