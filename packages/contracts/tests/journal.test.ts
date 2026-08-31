import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  buildExpenseJournalLines,
  buildSettlementJournalLines,
  computeBalancesFromJournal,
  computeProvisionalBalances,
  isZeroSumBalances,
} from "../src/finance.js";

test("expense journal is balanced and matches provisional nets", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b"]);
  const expense = {
    id: "e1",
    paidByUserId: "a",
    paymentLines: [{ userId: "a", amount: total }],
    total,
    splits,
    status: "posted" as const,
  };
  const lines = buildExpenseJournalLines(expense);
  const journalNets = computeBalancesFromJournal([
    { status: "posted", lines },
  ]);
  const docNets = computeProvisionalBalances([expense], []);
  assert.deepEqual(journalNets, docNets);
  assert.equal(isZeroSumBalances(journalNets), true);
});

test("settlement journal clears expense balance", () => {
  const total = { amountMinor: "100", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b"]);
  const expenseLines = buildExpenseJournalLines({
    paidByUserId: "a",
    paymentLines: [{ userId: "a", amount: total }],
    total,
    splits,
  });
  const settlementLines = buildSettlementJournalLines({
    fromUserId: "b",
    toUserId: "a",
    amount: { amountMinor: "50", currency: "IRR" },
  });
  const nets = computeBalancesFromJournal([
    { status: "posted", lines: expenseLines },
    { status: "posted", lines: settlementLines },
  ]);
  assert.equal(nets.length, 0);
});
