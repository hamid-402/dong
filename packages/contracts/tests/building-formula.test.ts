import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFormulaWeightsFromSubunits,
  buildingArrearsFromBalances,
} from "../src/building.js";

const subunits = [
  { id: "s1", memberUserIds: ["a", "b"], areaSqm: 80, occupancy: 2 },
  { id: "s2", memberUserIds: ["c"], areaSqm: 50, occupancy: 3 },
  { id: "s3", memberUserIds: ["a"], areaSqm: 20 },
  { id: "s4", memberUserIds: ["d"], areaSqm: -5, occupancy: 0 },
];

test("buildFormulaWeightsFromSubunits sums area across a participant's subunits", () => {
  const w = buildFormulaWeightsFromSubunits(["a", "b", "c"], subunits, "area");
  assert.deepEqual(w, [
    { userId: "a", weight: 100 },
    { userId: "b", weight: 80 },
    { userId: "c", weight: 50 },
  ]);
});

test("buildFormulaWeightsFromSubunits uses integer occupancy >= 1 and drops zero-weight users", () => {
  const w = buildFormulaWeightsFromSubunits(["a", "c", "d"], subunits, "occupancy");
  assert.deepEqual(w, [
    { userId: "a", weight: 2 },
    { userId: "c", weight: 3 },
  ]);
  const frac = buildFormulaWeightsFromSubunits(
    ["a"],
    [
      { id: "x", memberUserIds: ["a"], occupancy: 1.5 },
      { id: "y", memberUserIds: ["a"], occupancy: 4 },
    ],
    "occupancy",
  );
  assert.deepEqual(frac, [{ userId: "a", weight: 4 }]);
});

test("buildFormulaWeightsFromSubunits dedupes/trims participants and ignores non-finite area", () => {
  const w = buildFormulaWeightsFromSubunits(
    [" a ", "a", ""],
    [
      { id: "x", memberUserIds: ["a"], areaSqm: Number.POSITIVE_INFINITY },
      { id: "y", memberUserIds: ["a"], areaSqm: 10 },
    ],
    "area",
  );
  assert.deepEqual(w, [{ userId: "a", weight: 10 }]);
});

test("buildFormulaWeightsFromSubunits throws SPLIT_FORMULA when nothing is weighable", () => {
  assert.throws(() => buildFormulaWeightsFromSubunits([], subunits, "area"), /SPLIT_FORMULA/);
  assert.throws(() => buildFormulaWeightsFromSubunits(["  "], subunits, "area"), /SPLIT_FORMULA/);
  assert.throws(() => buildFormulaWeightsFromSubunits(["d"], subunits, "area"), /SPLIT_FORMULA/);
  assert.throws(() => buildFormulaWeightsFromSubunits(["zzz"], subunits, "occupancy"), /SPLIT_FORMULA/);
});

test("buildingArrearsFromBalances lists debtors by size then id with their subunits", () => {
  const line = (userId: string, amountMinor: string) => ({
    userId,
    net: { amountMinor, currency: "IRR" as const },
  });
  const out = buildingArrearsFromBalances(
    [line("a", "-300"), line("b", "500"), line("c", "-900"), line("e", "-300"), line("z", "0")] as never,
    subunits,
  );
  assert.deepEqual(
    out.map((r) => [r.userId, r.net.amountMinor, r.subunitIds]),
    [
      ["c", "-900", ["s2"]],
      ["a", "-300", ["s1", "s3"]],
      ["e", "-300", []],
    ],
  );
  assert.equal(out[0]!.net.currency, "IRR");
  assert.deepEqual(buildingArrearsFromBalances([], subunits), []);
});
