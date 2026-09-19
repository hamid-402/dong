import assert from "node:assert/strict";
import test from "node:test";
import {
  displayIntegerToIrrMinor,
  displayUnitLabel,
  irrMinorToDisplayInteger,
  resolveDisplayUnit,
} from "../src/money.js";

test("resolveDisplayUnit prefers user then workspace then rial", () => {
  assert.equal(resolveDisplayUnit(undefined, undefined), "rial");
  assert.equal(resolveDisplayUnit(null, "toman"), "toman");
  assert.equal(resolveDisplayUnit("rial", "toman"), "rial");
  assert.equal(resolveDisplayUnit("toman", "rial"), "toman");
});

test("irrMinorToDisplayInteger converts correctly both ways", () => {
  assert.equal(irrMinorToDisplayInteger(2500000, "rial"), 2500000n);
  assert.equal(irrMinorToDisplayInteger(2500000, "toman"), 250000n);
  assert.equal(irrMinorToDisplayInteger("15", "toman"), 1n);
});

test("displayIntegerToIrrMinor round-trips for whole units", () => {
  assert.equal(displayIntegerToIrrMinor(250000, "toman"), "2500000");
  assert.equal(displayIntegerToIrrMinor(2500000, "rial"), "2500000");
});

test("displayUnitLabel is Persian", () => {
  assert.equal(displayUnitLabel("rial"), "ریال");
  assert.equal(displayUnitLabel("toman"), "تومان");
});
