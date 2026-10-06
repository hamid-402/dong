import assert from "node:assert/strict";
import test from "node:test";
import { planSettlePay, suggestedPairwiseSettleMinor } from "../src/settle-pay.js";

test("suggestedPairwiseSettleMinor suggests min of debt and credit", () => {
  assert.equal(suggestedPairwiseSettleMinor("-1000", "400"), 400n);
  assert.equal(suggestedPairwiseSettleMinor("-1000", "2000"), 1000n);
});

test("suggestedPairwiseSettleMinor is zero when payer is not a debtor", () => {
  assert.equal(suggestedPairwiseSettleMinor("500", "2000"), 0n);
  assert.equal(suggestedPairwiseSettleMinor("-500", "-100"), 0n);
});

test("planSettlePay settle_only posts full amount and can create credit", () => {
  const plan = planSettlePay({
    intent: "settle_only",
    payAmountMinor: "1500",
    payerNetMinor: "-1000",
    counterpartyNetMinor: "2000",
  });
  assert.equal(plan.settlementAmountMinor, "1500");
  assert.equal(plan.giftAmountMinor, "0");
  assert.equal(plan.payerNetAfterSettlementMinor, "500");
});

test("planSettlePay settle_and_fund_gift splits at suggested", () => {
  const plan = planSettlePay({
    intent: "settle_and_fund_gift",
    payAmountMinor: "1500",
    payerNetMinor: "-1000",
    counterpartyNetMinor: "2000",
  });
  assert.equal(plan.suggestedSettleMinor, "1000");
  assert.equal(plan.settlementAmountMinor, "1000");
  assert.equal(plan.giftAmountMinor, "500");
  assert.equal(plan.payerNetAfterSettlementMinor, "0");
});

test("planSettlePay fund_gift_only never settles", () => {
  const plan = planSettlePay({
    intent: "fund_gift_only",
    payAmountMinor: "800",
    payerNetMinor: "-1000",
    counterpartyNetMinor: "2000",
  });
  assert.equal(plan.settlementAmountMinor, "0");
  assert.equal(plan.giftAmountMinor, "800");
  assert.equal(plan.payerNetAfterSettlementMinor, "-1000");
});
