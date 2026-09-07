import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualSplit,
  computeProvisionalBalances,
  settlementSuggestionsSatisfyGoldenRules,
  suggestMinimalSettlements,
} from "@dang/contracts";

test("three-party nets: golden rules hold for greedy suggestions", () => {
  const total = { amountMinor: "900", currency: "IRR" as const };
  const splits = allocateEqualSplit(total, ["a", "b", "c"]);
  const lines = computeProvisionalBalances(
    [{ paidByUserId: "a", total, splits, status: "posted" }],
    [],
  );
  const suggestions = suggestMinimalSettlements(lines);
  assert.equal(settlementSuggestionsSatisfyGoldenRules(lines, suggestions), true);
  // a paid all → creditors net positive for a; b and c debtors
  assert.ok(suggestions.every((s) => s.fromUserId !== "a"));
  assert.ok(suggestions.every((s) => s.toUserId === "a"));
});

test("golden rules reject a forged suggestion that increases obligation", () => {
  const lines = [
    {
      userId: "a",
      net: { amountMinor: "50", currency: "IRR" as const },
    },
    {
      userId: "b",
      net: { amountMinor: "-50", currency: "IRR" as const },
    },
  ];
  // Forged: a pays b (wrong direction)
  assert.equal(
    settlementSuggestionsSatisfyGoldenRules(lines, [
      {
        fromUserId: "a",
        toUserId: "b",
        amount: { amountMinor: "50", currency: "IRR" },
      },
    ]),
    false,
  );
});
