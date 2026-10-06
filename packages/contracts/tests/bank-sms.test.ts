import assert from "node:assert/strict";
import test from "node:test";
import { parseBankSms } from "../src/bank-sms.js";

test("deposit SMS keeps the transfer amount and drops the balance", () => {
  const parsed = parseBankSms(
    "بانک ملت\nواریز: ۱,۲۵۰,۰۰۰ ریال\nمانده: ۴,۵۰۰,۰۰۰ ریال\nپیگیری: 123456\n1404/08/15 14:32",
  );
  assert.equal(parsed.recognized, true);
  assert.equal(parsed.ambiguous, false);
  assert.equal(parsed.direction, "deposit");
  assert.equal(parsed.amountMinor, "1250000");
  assert.equal(parsed.trackingCode, "123456");
  assert.equal(parsed.bankName, "بانک ملت");
  assert.ok(parsed.isoDate);
});

test("toman purchase becomes rial minor", () => {
  const parsed = parseBankSms("خرید 250,000 تومان\nبانک سامان");
  assert.equal(parsed.recognized, true);
  assert.equal(parsed.direction, "purchase");
  assert.equal(parsed.amountMinor, "2500000");
  assert.equal(parsed.bankName, "بانک سامان");
});

test("unrelated text and two labeled amounts do not fill", () => {
  const noise = parseBankSms("سلام، فردا ساعت ۱۲ قرار داریم");
  assert.equal(noise.recognized, false);
  assert.equal(noise.amountMinor, undefined);

  const mixed = parseBankSms("واریز 100 ریال\nبرداشت 200 ریال");
  assert.equal(mixed.recognized, false);
  assert.equal(mixed.ambiguous, true);
  assert.equal(mixed.amountMinor, undefined);
});
