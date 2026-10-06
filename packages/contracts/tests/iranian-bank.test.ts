import assert from "node:assert/strict";
import test from "node:test";
import {
  bankFromCardBin,
  bankFromSheba,
  ibanCheckOk,
  inspectPayoutDestination,
  luhnOk,
} from "../src/iranian-bank.js";

test("luhn accepts a Melli sample and rejects a flipped check digit", () => {
  assert.equal(luhnOk("6037997188123450"), true);
  assert.equal(luhnOk("6037997188123451"), false);
  assert.equal(bankFromCardBin("6037997188123450")?.nameFa, "بانک ملی ایران");
});

test("card BIN names Blu while Sheba code 056 stays Saman", () => {
  assert.equal(bankFromCardBin("5047061234567895")?.id, "blubank");
  assert.equal(bankFromSheba("IR710560000000100324200001")?.nameFa, "بانک سامان");
});

test("sheba mod 97 accepts the Melli sample", () => {
  assert.equal(ibanCheckOk("IR270170000000100324200001"), true);
  assert.equal(ibanCheckOk("IR120170000000123456789001"), false);
});

test("inspect folds Persian digits and withholds the bank when the check fails", () => {
  const folded = inspectPayoutDestination("card", "۶۰۳۷۹۹۷۱۸۸۱۲۳۴۵۰");
  assert.equal(folded.normalized, "6037997188123450");
  assert.equal(folded.checkOk, true);
  assert.equal(folded.bank?.nameFa, "بانک ملی ایران");

  const broken = inspectPayoutDestination("card", "6037997188123451");
  assert.equal(broken.formatOk, true);
  assert.equal(broken.checkOk, false);
  assert.equal(broken.bank, null);

  let unknownCard = "";
  for (let digit = 0; digit < 10; digit += 1) {
    const candidate = `999999000000000${digit}`;
    if (luhnOk(candidate)) {
      unknownCard = candidate;
      break;
    }
  }
  const unknown = inspectPayoutDestination("card", unknownCard);
  assert.equal(unknown.checkOk, true);
  assert.equal(unknown.bank, null);
});
