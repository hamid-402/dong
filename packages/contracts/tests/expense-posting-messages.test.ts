import assert from "node:assert/strict";
import test from "node:test";
import { postingHoldMessageFa, resolvePostingDecision } from "../src/expense-posting.js";
import {
  moneyIrr,
  netForUser,
  planSettlePay,
  settlePayIntentNeedsFund,
} from "../src/settle-pay.js";

test("postingHoldMessageFa picks the message by reason priority", () => {
  const none = postingHoldMessageFa([]);
  const receipt = postingHoldMessageFa(["receipt_required", "four_eyes"]);
  const fourEyes = postingHoldMessageFa(["four_eyes", "company_needs_approver_role"]);
  const company = postingHoldMessageFa(["company_needs_approver_role", "requires_approval"]);
  const generic = postingHoldMessageFa(["requires_approval"]);
  const generic2 = postingHoldMessageFa(["over_approval_threshold"]);

  const all = [none, receipt, fourEyes, company, generic];
  assert.equal(new Set(all).size, all.length);
  for (const m of all) assert.ok(m.length > 0);
  assert.equal(generic, generic2);
  assert.equal(postingHoldMessageFa(["four_eyes"]), fourEyes);
  assert.equal(postingHoldMessageFa(["receipt_required"]), receipt);
});

test("resolvePostingDecision: category receipt rule, approved bypass, company role, malformed thresholds", () => {
  const base = {
    totalMinor: "10",
    visibility: "shared" as const,
    requiresApproval: false,
    approved: false,
  };
  const cat = resolvePostingDecision({ ...base, categoryId: "c1", requireReceiptCategoryIds: ["c1"] });
  assert.deepEqual(cat, { commit: "await_approval", reasons: ["receipt_required"] });
  assert.equal(
    resolvePostingDecision({ ...base, categoryId: "c1", requireReceiptCategoryIds: ["c1"], hasReceipt: true }).commit,
    "post",
  );
  assert.equal(resolvePostingDecision({ ...base, categoryId: "c2", requireReceiptCategoryIds: ["c1"] }).commit, "post");

  const approved = resolvePostingDecision({
    ...base,
    approved: true,
    requiresApproval: true,
    approvalThresholdMinor: "1",
    actorIsMaker: true,
    makerCheckerThresholdMinor: "1",
  });
  assert.equal(approved.commit, "post");

  const company = resolvePostingDecision({ ...base, visibility: "company", actorCanPostCompany: false });
  assert.deepEqual(company.reasons, ["company_needs_approver_role"]);
  assert.equal(resolvePostingDecision({ ...base, visibility: "company", actorCanPostCompany: true }).commit, "post");

  assert.equal(resolvePostingDecision({ ...base, approvalThresholdMinor: "abc" }).commit, "post");
  assert.equal(resolvePostingDecision({ ...base, approvalThresholdMinor: "   " }).commit, "post");

  const multi = resolvePostingDecision({
    ...base,
    requiresApproval: true,
    approvalThresholdMinor: "5",
    actorIsMaker: true,
    makerCheckerThresholdMinor: "5",
  });
  assert.deepEqual(multi.reasons, ["requires_approval", "over_approval_threshold", "four_eyes"]);
});

test("netForUser reads a user's net or zero when absent", () => {
  const lines = [
    { userId: "a", net: { amountMinor: "-300", currency: "IRR" } },
    { userId: "b", net: { amountMinor: "300", currency: "IRR" } },
  ] as never;
  assert.equal(netForUser(lines, "a"), -300n);
  assert.equal(netForUser(lines, "b"), 300n);
  assert.equal(netForUser(lines, "zzz"), 0n);
});

test("moneyIrr and settlePayIntentNeedsFund", () => {
  assert.deepEqual(moneyIrr("42"), { amountMinor: "42", currency: "IRR" });
  assert.equal(settlePayIntentNeedsFund("settle_only"), false);
  assert.equal(settlePayIntentNeedsFund("settle_and_fund_gift"), true);
  assert.equal(settlePayIntentNeedsFund("fund_gift_only"), true);
});

test("planSettlePay rejects non-positive pay amounts and caps settle at pay when pay < suggested", () => {
  for (const pay of ["0", "-5"]) {
    assert.throws(
      () =>
        planSettlePay({
          intent: "settle_only",
          payAmountMinor: pay,
          payerNetMinor: "-100",
          counterpartyNetMinor: "100",
        }),
      /PAY_AMOUNT_NON_POSITIVE/,
    );
  }
  const plan = planSettlePay({
    intent: "settle_and_fund_gift",
    payAmountMinor: "300",
    payerNetMinor: "-1000",
    counterpartyNetMinor: "5000",
  });
  assert.equal(plan.settlementAmountMinor, "300");
  assert.equal(plan.giftAmountMinor, "0");
  assert.equal(plan.payerNetAfterSettlementMinor, "-700");

  const noDebt = planSettlePay({
    intent: "settle_and_fund_gift",
    payAmountMinor: "300",
    payerNetMinor: "50",
    counterpartyNetMinor: "5000",
  });
  assert.equal(noDebt.suggestedSettleMinor, "0");
  assert.equal(noDebt.giftAmountMinor, "300");
});
