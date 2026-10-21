import assert from "node:assert/strict";
import test from "node:test";
import { signedPettyCashDelta } from "../src/payment-ops.js";
import {
  createCreditPurchasePaymentRequestSchema,
  createCreditPurchaseRequestSchema,
  createOnBehalfPaymentRequestSchema,
  createPaymentReceiptRequestSchema,
  createPettyCashFundRequestSchema,
  createPettyCashMovementRequestSchema,
  giftPettyCashRequestSchema,
  onBehalfPaymentListSchema,
  onBehalfPaymentSummarySchema,
  rejectOnBehalfPaymentRequestSchema,
  rejectPaymentReceiptRequestSchema,
  settlePayRequestSchema,
  spendPettyCashAsExpenseRequestSchema,
  topupPettyCashFromMembersRequestSchema,
} from "../src/schemas/payment-ops.js";

const issues = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

test("signedPettyCashDelta signs by movement kind", () => {
  assert.equal(signedPettyCashDelta("topup", "500"), 500n);
  assert.equal(signedPettyCashDelta("topup", "-500"), 500n);
  assert.equal(signedPettyCashDelta("return", "-70"), 70n);
  assert.equal(signedPettyCashDelta("gift", "40"), 40n);
  assert.equal(signedPettyCashDelta("spend", "300"), -300n);
  assert.equal(signedPettyCashDelta("spend", "-300"), -300n);
  assert.equal(signedPettyCashDelta("adjust", "-25"), -25n);
  assert.equal(signedPettyCashDelta("adjust", "25"), 25n);
});

test("createPaymentReceiptRequestSchema requires a reference for card_to_card", () => {
  const base = {
    method: "card_to_card" as const,
    amountMinor: "1000",
    paidAt: "2026-03-01T10:00:00+03:30",
    idempotencyKey: "k1",
  };
  const bad = createPaymentReceiptRequestSchema.safeParse(base);
  assert.equal(bad.success, false);
  assert.deepEqual(issues(bad), ["CARD_TRANSFER_REF_REQUIRED"]);

  assert.ok(createPaymentReceiptRequestSchema.safeParse({ ...base, referenceNo: "R1", destLast4: "1234" }).success);
  assert.ok(createPaymentReceiptRequestSchema.safeParse({ ...base, method: "cash" }).success);
  assert.equal(
    createPaymentReceiptRequestSchema.safeParse({ ...base, method: "cash", destLast4: "12345" }).success,
    false,
  );
  assert.equal(
    createPaymentReceiptRequestSchema.safeParse({ ...base, method: "cash", amountMinor: "0" }).success,
    false,
  );
  assert.equal(
    createPaymentReceiptRequestSchema.safeParse({ ...base, method: "cash", paidAt: "yesterday" }).success,
    false,
  );
  assert.equal(
    createPaymentReceiptRequestSchema.safeParse({ ...base, method: "cash", pan: "4111111111111111" }).success,
    false,
  );
});

test("reject schemas need a non-empty note", () => {
  assert.ok(rejectPaymentReceiptRequestSchema.safeParse({ note: "bad" }).success);
  assert.equal(rejectPaymentReceiptRequestSchema.safeParse({ note: "   " }).success, false);
  assert.ok(rejectOnBehalfPaymentRequestSchema.safeParse({ note: "no" }).success);
  assert.equal(rejectOnBehalfPaymentRequestSchema.safeParse({}).success, false);
});

test("petty cash fund and movement schemas", () => {
  assert.ok(createPettyCashFundRequestSchema.safeParse({ name: "Box", openingBalanceMinor: "0", idempotencyKey: "k" }).success);
  assert.equal(
    createPettyCashFundRequestSchema.safeParse({ name: "Box", openingBalanceMinor: "-1", idempotencyKey: "k" }).success,
    false,
  );

  const spend = createPettyCashMovementRequestSchema.safeParse({
    kind: "spend",
    amountMinor: "100",
    idempotencyKey: "k",
  });
  assert.equal(spend.success, false);
  assert.deepEqual(issues(spend), ["PETTY_CASH_SPEND_NEEDS_EXPENSE"]);
  assert.ok(
    createPettyCashMovementRequestSchema.safeParse({
      kind: "spend",
      amountMinor: "100",
      expenseId: "e1",
      idempotencyKey: "k",
    }).success,
  );
  assert.ok(
    createPettyCashMovementRequestSchema.safeParse({ kind: "adjust", amountMinor: "-100", idempotencyKey: "k" }).success,
  );
  assert.equal(
    createPettyCashMovementRequestSchema.safeParse({ kind: "adjust", amountMinor: "0", idempotencyKey: "k" }).success,
    false,
  );
  assert.equal(
    createPettyCashMovementRequestSchema.safeParse({ kind: "bogus", amountMinor: "1", idempotencyKey: "k" }).success,
    false,
  );
});

test("topup/spend-from-petty-cash schemas validate participants and splits", () => {
  const body = {
    amountMinor: "900",
    participantUserIds: ["a", "b"],
    splitMethod: "amount" as const,
    splitLines: [
      { userId: "a", amount: { amountMinor: "400", currency: "IRR" as const } },
      { userId: "b", amount: { amountMinor: "500", currency: "IRR" as const } },
    ],
    occurredOn: "2026-03-01",
    idempotencyKey: "k",
  };
  assert.ok(topupPettyCashFromMembersRequestSchema.safeParse(body).success);
  assert.ok(spendPettyCashAsExpenseRequestSchema.safeParse({ ...body, title: "Tea" }).success);
  for (const schema of [topupPettyCashFromMembersRequestSchema, spendPettyCashAsExpenseRequestSchema]) {
    assert.equal(schema.safeParse({ ...body, participantUserIds: [] }).success, false);
    assert.equal(schema.safeParse({ ...body, occurredOn: "1/3/2026" }).success, false);
    assert.equal(schema.safeParse({ ...body, amountMinor: "0900" }).success, false);
    assert.equal(
      schema.safeParse({ ...body, splitLines: [{ userId: "a", shares: -1 }] }).success,
      false,
    );
  }
});

test("gift schema and credit purchase schemas", () => {
  assert.ok(giftPettyCashRequestSchema.safeParse({ amountMinor: "10", idempotencyKey: "k" }).success);
  assert.equal(giftPettyCashRequestSchema.safeParse({ amountMinor: "-10", idempotencyKey: "k" }).success, false);

  const purchase = {
    supplierRef: "Acme",
    amountMinor: "5000",
    purchasedAt: "2026-03-01T00:00:00Z",
    dueDate: "2026-04-01",
    idempotencyKey: "k",
  };
  assert.ok(createCreditPurchaseRequestSchema.safeParse(purchase).success);
  assert.equal(createCreditPurchaseRequestSchema.safeParse({ ...purchase, dueDate: "soon" }).success, false);
  assert.equal(createCreditPurchaseRequestSchema.safeParse({ ...purchase, supplierRef: "" }).success, false);

  assert.ok(
    createCreditPurchasePaymentRequestSchema.safeParse({
      amountMinor: "100",
      sourceKind: "petty_cash",
      idempotencyKey: "k",
    }).success,
  );
  assert.equal(
    createCreditPurchasePaymentRequestSchema.safeParse({ amountMinor: "100", sourceKind: "", idempotencyKey: "k" }).success,
    false,
  );
});

test("on-behalf payments require distinct debtor and payer", () => {
  const body = {
    debtorUserId: "u1",
    payerUserId: "u2",
    amountMinor: "100",
    method: "cash" as const,
    idempotencyKey: "k",
  };
  assert.ok(createOnBehalfPaymentRequestSchema.safeParse(body).success);
  const same = createOnBehalfPaymentRequestSchema.safeParse({ ...body, payerUserId: "u1" });
  assert.equal(same.success, false);
  assert.ok(issues(same).includes("debtorUserId and payerUserId must differ"));
});

test("on-behalf summary schema accepts honest rows and rejects extras", () => {
  const row = {
    id: "p1",
    workspaceId: "w1",
    debtorUserId: "u1",
    payerUserId: "u2",
    amount: { amountMinor: "100", currency: "IRR" as const },
    method: "bank_transfer" as const,
    status: "pending" as const,
    initiatedByUserId: "u1",
    createdAt: "2026-03-01T00:00:00Z",
  };
  assert.ok(onBehalfPaymentSummarySchema.safeParse(row).success);
  assert.ok(onBehalfPaymentListSchema.safeParse([row, { ...row, id: "p2" }]).success);
  assert.equal(onBehalfPaymentListSchema.safeParse([{ ...row, status: "weird" }]).success, false);
  assert.equal(onBehalfPaymentSummarySchema.safeParse({ ...row, approvalsHave: 1 }).success, false);
});

test("settlePayRequestSchema requires fundId for gift intents", () => {
  const base = { counterpartyUserId: "u2", amountMinor: "100", idempotencyKey: "k" };
  assert.ok(settlePayRequestSchema.safeParse({ ...base, intent: "settle_only" }).success);
  for (const intent of ["settle_and_fund_gift", "fund_gift_only"] as const) {
    const r = settlePayRequestSchema.safeParse({ ...base, intent });
    assert.equal(r.success, false);
    assert.deepEqual(issues(r), ["FUND_ID_REQUIRED_FOR_GIFT"]);
    assert.ok(settlePayRequestSchema.safeParse({ ...base, intent, fundId: "f1", previewOnly: true, asOf: "2026-03-01" }).success);
  }
});
