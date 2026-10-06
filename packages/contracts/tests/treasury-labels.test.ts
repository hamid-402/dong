import assert from "node:assert/strict";
import test from "node:test";
import {
  pettyCashAllowedForKind,
  treasuryLabelsForKind,
} from "../src/treasury-labels.js";

test("treasury labels differ by kind but share duty concept", () => {
  assert.equal(treasuryLabelsForKind("group").financeRole, "مادرخرج");
  assert.equal(treasuryLabelsForKind("org").financeRole, "مدیر مالی");
  assert.equal(treasuryLabelsForKind("building").pettyCash, "تنخواه ساختمان");
  assert.equal(pettyCashAllowedForKind("personal"), false);
  assert.equal(pettyCashAllowedForKind("group"), true);
});
