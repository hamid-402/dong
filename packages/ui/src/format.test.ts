import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  formatMoneyFromIrrMinor,
  formatMoneyWithUnit,
  formatToman,
  formatTomanFromIrrMinor,
} from "./format.js";

test("formatToman uses fa-IR digits and grouping (legacy wrapper)", () => {
  const s = formatToman(1234567);
  assert.ok(s.length > 0);
  assert.notEqual(s, "1234567");
  assert.match(s, /[۰-۹]/);
  assert.doesNotMatch(s, /[0-9]/);
});

test("formatTomanFromIrrMinor divides by 10", () => {
  assert.equal(formatTomanFromIrrMinor(10), formatToman(1));
});

test("formatMoneyFromIrrMinor rial keeps minor units", () => {
  assert.equal(formatMoneyFromIrrMinor(2_500_000, "rial"), formatMoney(2_500_000, "rial"));
  assert.equal(formatMoneyFromIrrMinor(10, "rial"), formatMoney(10, "rial"));
});

test("formatMoneyFromIrrMinor toman divides by 10", () => {
  assert.equal(formatMoneyFromIrrMinor(2_500_000, "toman"), formatMoney(250_000, "toman"));
});

test("formatMoneyWithUnit always includes unit label", () => {
  assert.match(formatMoneyWithUnit(1000, "rial"), /ریال/);
  assert.match(formatMoneyWithUnit(1000, "toman"), /تومان/);
});
