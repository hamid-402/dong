import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCT_FLAG_ENV,
  readProductFeatureFlags,
  spaceKindOffered,
} from "../src/product-flags.js";

test("development/test default turns product flags on, except settlementEvidence", () => {
  for (const env of [{}, { NODE_ENV: "development" }, { NODE_ENV: "test" }]) {
    const f = readProductFeatureFlags(env);
    const { settlementEvidence, ...rest } = f;
    assert.equal(settlementEvidence, false);
    assert.ok(Object.values(rest).every((v) => v === true));
  }
  assert.ok(Object.keys(readProductFeatureFlags()).every((k) => k in PRODUCT_FLAG_ENV));
});

test("production defaults every flag off until opted in, except paymentReceiptRequired", () => {
  const f = readProductFeatureFlags({ NODE_ENV: "production" });
  const { paymentReceiptRequired, ...rest } = f;
  assert.equal(paymentReceiptRequired, true);
  assert.ok(Object.values(rest).every((v) => v === false));
  const on = readProductFeatureFlags({
    NODE_ENV: "production",
    [PRODUCT_FLAG_ENV.addonAck]: "1",
    [PRODUCT_FLAG_ENV.makerChecker]: "TRUE",
    [PRODUCT_FLAG_ENV.settlementEvidence]: "true",
  });
  assert.equal(on.addonAck, true);
  assert.equal(on.makerChecker, true);
  assert.equal(on.settlementEvidence, true);
  assert.equal(on.recurrenceWorker, false);
  assert.equal(on.paymentReceiptRequired, true);
});

test("paymentReceiptRequired defaults ON; explicit 0 restores optional attachment", () => {
  assert.equal(
    readProductFeatureFlags({ NODE_ENV: "production" }).paymentReceiptRequired,
    true,
  );
  assert.equal(
    readProductFeatureFlags({
      NODE_ENV: "production",
      [PRODUCT_FLAG_ENV.paymentReceiptRequired]: "0",
    }).paymentReceiptRequired,
    false,
  );
  assert.equal(
    PRODUCT_FLAG_ENV.paymentReceiptRequired,
    "ENABLE_PAYMENT_RECEIPT_REQUIRED",
  );
});

test("explicit 0/false forces a flag off even in development", () => {
  const f = readProductFeatureFlags({
    [PRODUCT_FLAG_ENV.biCompare]: "0",
    [PRODUCT_FLAG_ENV.costCenter]: "false",
    [PRODUCT_FLAG_ENV.allowance]: "no",
    [PRODUCT_FLAG_ENV.fxRates]: "",
  });
  assert.equal(f.biCompare, false);
  assert.equal(f.costCenter, false);
  assert.equal(f.allowance, false);
  assert.equal(f.fxRates, true);
});

test("DANG_PRODUCT_FLAGS_DEFAULT overrides the unset default for all flags", () => {
  const on = readProductFeatureFlags({ NODE_ENV: "production", DANG_PRODUCT_FLAGS_DEFAULT: "1" });
  assert.equal(on.expensePolicy, true);
  assert.equal(on.orgSpaces, true);
  assert.equal(on.settlementEvidence, false);
  assert.equal(on.paymentReceiptRequired, true);
  const off = readProductFeatureFlags({ NODE_ENV: "development", DANG_PRODUCT_FLAGS_DEFAULT: "0" });
  const { paymentReceiptRequired, ...rest } = off;
  assert.equal(paymentReceiptRequired, true);
  assert.ok(Object.values(rest).every((v) => v === false));
});

test("every flag reads from its documented env var", () => {
  for (const [flag, envKey] of Object.entries(PRODUCT_FLAG_ENV)) {
    const on = readProductFeatureFlags({ NODE_ENV: "production", [envKey]: "1" });
    assert.equal((on as Record<string, boolean>)[flag], true, flag);
    const off = readProductFeatureFlags({ NODE_ENV: "development", [envKey]: "0" });
    assert.equal((off as Record<string, boolean>)[flag], false, flag);
  }
});

test("spaceKindOffered gates only building and org", () => {
  const flags = { buildingSpaces: false, orgSpaces: true };
  assert.equal(spaceKindOffered("personal", flags), true);
  assert.equal(spaceKindOffered("group", flags), true);
  assert.equal(spaceKindOffered("building", flags), false);
  assert.equal(spaceKindOffered("org", flags), true);
  assert.equal(spaceKindOffered("building", { buildingSpaces: true, orgSpaces: false }), true);
  assert.equal(spaceKindOffered("org", { buildingSpaces: true, orgSpaces: false }), false);
});
