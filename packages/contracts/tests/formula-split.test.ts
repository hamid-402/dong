import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateFormulaSplit,
  allocateExpenseSplit,
} from "../src/finance.js";
import { buildFormulaWeightsFromSubunits } from "../src/building.js";

test("allocateFormulaSplit splits 1000 toman by area 60/40", () => {
  const total = { amountMinor: "10000", currency: "IRR" as const };
  const lines = allocateFormulaSplit(total, [
    { userId: "a", weight: 60 },
    { userId: "b", weight: 40 },
  ]);
  assert.equal(lines.length, 2);
  const byUser = Object.fromEntries(lines.map((l) => [l.userId, l.amount.amountMinor]));
  assert.equal(byUser.a, "6000");
  assert.equal(byUser.b, "4000");
  assert.equal(
    lines.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n),
    10000n,
  );
});

test("allocateExpenseSplit formula uses formulaWeights", () => {
  const total = { amountMinor: "10000", currency: "IRR" as const };
  const splits = allocateExpenseSplit({
    total,
    splitMethod: "formula",
    participantUserIds: ["a", "b"],
    formulaWeights: [
      { userId: "a", weight: 60 },
      { userId: "b", weight: 40 },
    ],
  });
  assert.equal(splits.find((s) => s.userId === "a")?.amount.amountMinor, "6000");
});

test("buildFormulaWeightsFromSubunits sums member subunit areas", () => {
  const weights = buildFormulaWeightsFromSubunits(
    ["u1", "u2"],
    [
      {
        id: "s1",
        memberUserIds: ["u1"],
        areaSqm: 60,
      },
      {
        id: "s2",
        memberUserIds: ["u2"],
        areaSqm: 40,
      },
    ],
    "area",
  );
  assert.deepEqual(weights, [
    { userId: "u1", weight: 60 },
    { userId: "u2", weight: 40 },
  ]);
});

test("buildFormulaWeightsFromSubunits throws when all weights zero", () => {
  assert.throws(
    () =>
      buildFormulaWeightsFromSubunits(
        ["u1"],
        [{ id: "s1", memberUserIds: ["u1"] }],
        "area",
      ),
    /SPLIT_FORMULA/,
  );
});
