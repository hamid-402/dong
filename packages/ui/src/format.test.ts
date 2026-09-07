import { test } from "node:test";
import assert from "node:assert/strict";
import { formatToman, formatTomanFromIrrMinor } from "./format.js";

test("formatToman uses fa-IR digits and grouping", () => {
  const s = formatToman(1234567);
  assert.ok(s.length > 0);
  assert.notEqual(s, "1234567");
  // Persian/Arabic-Indic digits (fa-IR)
  assert.match(s, /[۰-۹]/);
  assert.doesNotMatch(s, /[0-9]/);
});

test("formatTomanFromIrrMinor divides by 10", () => {
  // 10 IRR = 1 toman
  assert.equal(formatTomanFromIrrMinor(10), formatToman(1));
});
