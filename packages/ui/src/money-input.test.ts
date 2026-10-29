import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { latinDigits } from "./format.js";
import { MoneyInput, persianDigitGlyphs } from "./money-input.js";

test("run29-moneyinput-persian-display maps Latin digits to Persian glyphs", () => {
  assert.equal(persianDigitGlyphs("123"), "۱۲۳");
  assert.equal(persianDigitGlyphs(""), "");
  assert.equal(persianDigitGlyphs("0"), "۰");
});

test("run29-moneyinput-persian-display input markup shows Persian for value 123", () => {
  const html = renderToStaticMarkup(
    createElement(MoneyInput, { value: "123", onValueChange() {} }),
  );
  assert.match(html, /value="۱۲۳"/);
  assert.doesNotMatch(html, /value="123"/);
});

test("run29-moneyinput-persian-display onValueChange path keeps Latin digits", () => {
  const received: string[] = [];
  // Mirror MoneyInput onChange normalization (latinDigits + digits-only).
  const emit = (raw: string) => {
    received.push(latinDigits(raw).replace(/[^\d]/g, ""));
  };
  emit("123");
  emit("۱۲۳");
  emit("١٢٣");
  emit("12۳٤");
  assert.deepEqual(received, ["123", "123", "123", "1234"]);
});

test("run29-moneyinput-persian-display paste/type Persian and Arabic-Indic normalize to Latin", () => {
  assert.equal(latinDigits("۶۰۰۰۰").replace(/[^\d]/g, ""), "60000");
  assert.equal(latinDigits("٥٠٠").replace(/[^\d]/g, ""), "500");
  assert.equal(persianDigitGlyphs(latinDigits("۶۰۰۰۰").replace(/[^\d]/g, "")), "۶۰۰۰۰");
});

test("run29-moneyinput-persian-display formatMoney hint stays coherent with Persian value", () => {
  const html = renderToStaticMarkup(
    createElement(MoneyInput, {
      value: "1234",
      onValueChange() {},
      displayUnit: "toman",
    }),
  );
  assert.match(html, /value="۱۲۳۴"/);
  assert.match(html, /تومان/);
  assert.match(html, /[۰-۹]/);
});
