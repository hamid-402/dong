import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateAmountSplit,
  allocateEqualSplit,
  allocateExpenseSplit,
  allocateItemizedSplit,
  allocatePercentSplit,
  allocateSharesSplit,
  buildExpenseJournalLines,
  normalizePaymentLines,
} from "../src/finance.js";

test("allocateEqualSplit divides evenly", () => {
  const lines = allocateEqualSplit(
    { amountMinor: "100", currency: "IRR" },
    ["a", "b"],
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.amount.amountMinor, "50");
  assert.equal(lines[1]?.amount.amountMinor, "50");
});

test("allocateEqualSplit gives remainder to earliest participants", () => {
  const lines = allocateEqualSplit(
    { amountMinor: "100", currency: "IRR" },
    ["a", "b", "c"],
  );
  assert.deepEqual(
    lines.map((line) => line.amount.amountMinor),
    ["34", "33", "33"],
  );
  const sum = lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  assert.equal(sum, 100n);
});

test("allocateEqualSplit dedupes participants", () => {
  const lines = allocateEqualSplit(
    { amountMinor: "10", currency: "IRR" },
    ["a", "a", "b"],
  );
  assert.equal(lines.length, 2);
  assert.equal(
    lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n),
    10n,
  );
});

test("allocateAmountSplit requires exact sum", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const lines = allocateAmountSplit(total, [
    { userId: "a", amount: { amountMinor: "60", currency: "IRR" } },
    { userId: "b", amount: { amountMinor: "40", currency: "IRR" } },
  ]);
  assert.equal(lines.length, 2);
  assert.throws(() =>
    allocateAmountSplit(total, [
      { userId: "a", amount: { amountMinor: "50", currency: "IRR" } },
    ]),
  );
});

test("allocatePercentSplit uses basis points", () => {
  const total = { amountMinor: "10000", currency: "IRR" as const };
  const lines = allocatePercentSplit(total, [
    { userId: "a", percent: "7500" },
    { userId: "b", percent: "2500" },
  ]);
  assert.equal(
    lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n),
    10000n,
  );
});

test("allocateSharesSplit distributes by weight", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const lines = allocateSharesSplit(total, [
    { userId: "a", shares: 2 },
    { userId: "b", shares: 1 },
  ]);
  assert.equal(lines[0]?.amount.amountMinor, "67");
  assert.equal(lines[1]?.amount.amountMinor, "33");
});

test("ice-cream equal: four people share 10000 remainder", () => {
  const lines = allocateEqualSplit(
    { amountMinor: "10000", currency: "IRR" },
    ["ali", "sara", "reza", "mina"],
  );
  const sum = lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  assert.equal(sum, 10000n);
  assert.equal(lines.length, 4);
});

test("lunch amount omits Reza — only Ali and Sara owe", () => {
  const total = { amountMinor: "7500", currency: "IRR" as const };
  const lines = allocateAmountSplit(total, [
    { userId: "ali", amount: { amountMinor: "3000", currency: "IRR" } },
    { userId: "sara", amount: { amountMinor: "4500", currency: "IRR" } },
  ]);
  assert.equal(lines.some((l) => l.userId === "reza"), false);
  assert.equal(
    lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n),
    7500n,
  );
});

test("itemized shared appetizer + tip equals total", () => {
  const result = allocateItemizedSplit({
    items: [
      {
        title: "پیش‌غذا مشترک",
        amount: { amountMinor: "2000", currency: "IRR" },
        assigneeUserIds: ["ali", "sara"],
      },
      {
        title: "غذای علی",
        amount: { amountMinor: "3000", currency: "IRR" },
        assigneeUserIds: ["ali"],
      },
      {
        title: "غذای سارا",
        amount: { amountMinor: "4000", currency: "IRR" },
        assigneeUserIds: ["sara"],
      },
    ],
    tip: { amountMinor: "900", currency: "IRR" },
    tax: { amountMinor: "100", currency: "IRR" },
  });
  assert.equal(result.total.amountMinor, "10000");
  const sum = result.splits.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  assert.equal(sum, 10000n);
  assert.equal(result.splits.some((l) => l.userId === "reza"), false);
});

test("family defaultShares 2:1 rent split", () => {
  const lines = allocateSharesSplit(
    { amountMinor: "3000", currency: "IRR" },
    [
      { userId: "parent", shares: 2 },
      { userId: "child", shares: 1 },
    ],
  );
  assert.equal(lines[0]?.amount.amountMinor, "2000");
  assert.equal(lines[1]?.amount.amountMinor, "1000");
});

test("multi-payer journal stays balanced", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const paymentLines = normalizePaymentLines(total, "a", [
    { userId: "a", amount: { amountMinor: "60", currency: "IRR" } },
    { userId: "b", amount: { amountMinor: "40", currency: "IRR" } },
  ]);
  const splits = allocateExpenseSplit({
    total,
    splitMethod: "equal",
    participantUserIds: ["a", "b"],
  });
  const lines = buildExpenseJournalLines({
    paidByUserId: "a",
    paymentLines,
    total,
    splits,
  });
  const debit = lines
    .filter((line) => line.side === "debit")
    .reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  const credit = lines
    .filter((line) => line.side === "credit")
    .reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  assert.equal(debit, credit);
});
