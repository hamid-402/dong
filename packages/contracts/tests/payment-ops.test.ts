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
import { assertRejection } from "./assert-rejection.js";

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
  const payee = { payeeUserId: "11111111-1111-4111-8111-111111111111" };
  const attachmentId = "22222222-2222-4222-8222-222222222222";
  const base = {
    method: "card_to_card" as const,
    amountMinor: "1000",
    paidAt: "2026-03-01T10:00:00+03:30",
    idempotencyKey: "k1",
    ...payee,
  };
  const bad = createPaymentReceiptRequestSchema.safeParse(base);
  assert.equal(bad.success, false);
  assert.ok(issues(bad).includes("CARD_TRANSFER_REF_REQUIRED"));

  // Attachment is flag-aware in the API service — schema allows omit (legacy / flag off).
  assert.ok(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      referenceNo: "R1",
      destLast4: "1234",
    }).success,
  );
  assert.ok(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      referenceNo: "R1",
      destLast4: "1234",
      attachmentId,
    }).success,
  );
  assert.ok(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      method: "cash",
      ...payee,
    }).success,
  );
  assertRejection(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      method: "cash",
      destLast4: "12345",
    }),
    { path: ["destLast4"] },
  );
  assertRejection(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      method: "cash",
      amountMinor: "0",
    }),
    { path: ["amountMinor"] },
  );
  assertRejection(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      method: "cash",
      paidAt: "yesterday",
    }),
    { path: ["paidAt"] },
  );
  assertRejection(
    createPaymentReceiptRequestSchema.safeParse({
      ...base,
      method: "cash",
      pan: "4111111111111111",
    }),
    { code: "unrecognized_keys" },
  );
});

test("createPaymentReceiptRequestSchema rejects memberInvoiceId without payee", () => {
  const bad = createPaymentReceiptRequestSchema.safeParse({
    memberInvoiceId: "11111111-1111-4111-8111-111111111111",
    method: "cash",
    amountMinor: "1000",
    paidAt: "2026-03-01T10:00:00+03:30",
    idempotencyKey: "k-invoice-only",
  });
  assert.equal(bad.success, false);
  assert.ok(issues(bad).includes("PAYEE_REQUIRED"));
});

test("reject schemas need a non-empty note", () => {
  assert.ok(rejectPaymentReceiptRequestSchema.safeParse({ note: "bad" }).success);
  assertRejection(rejectPaymentReceiptRequestSchema.safeParse({ note: "   " }), { path: ["note"] });
  assert.ok(rejectOnBehalfPaymentRequestSchema.safeParse({ note: "no" }).success);
  assertRejection(rejectOnBehalfPaymentRequestSchema.safeParse({}), { path: ["note"] });
});

test("petty cash fund and movement schemas", () => {
  assert.ok(createPettyCashFundRequestSchema.safeParse({ name: "Box", openingBalanceMinor: "0", idempotencyKey: "k" }).success);
  assertRejection(
    createPettyCashFundRequestSchema.safeParse({ name: "Box", openingBalanceMinor: "-1", idempotencyKey: "k" }),
    { path: ["openingBalanceMinor"] },
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
  assertRejection(
    createPettyCashMovementRequestSchema.safeParse({ kind: "adjust", amountMinor: "0", idempotencyKey: "k" }),
    { path: ["amountMinor"] },
  );
  assertRejection(
    createPettyCashMovementRequestSchema.safeParse({ kind: "bogus", amountMinor: "1", idempotencyKey: "k" }),
    { path: ["kind"] },
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
    assertRejection(schema.safeParse({ ...body, participantUserIds: [] }), {
      path: ["participantUserIds"],
    });
    assertRejection(schema.safeParse({ ...body, occurredOn: "1/3/2026" }), {
      path: ["occurredOn"],
    });
    assertRejection(schema.safeParse({ ...body, amountMinor: "0900" }), {
      path: ["amountMinor"],
    });
    assertRejection(schema.safeParse({ ...body, splitLines: [{ userId: "a", shares: -1 }] }), {
      path: ["splitLines", 0, "shares"],
    });
  }
});

test("gift schema and credit purchase schemas", () => {
  assert.ok(giftPettyCashRequestSchema.safeParse({ amountMinor: "10", idempotencyKey: "k" }).success);
  assertRejection(giftPettyCashRequestSchema.safeParse({ amountMinor: "-10", idempotencyKey: "k" }), {
    path: ["amountMinor"],
  });

  const purchase = {
    supplierRef: "Acme",
    amountMinor: "5000",
    purchasedAt: "2026-03-01T00:00:00Z",
    dueDate: "2026-04-01",
    idempotencyKey: "k",
  };
  assert.ok(createCreditPurchaseRequestSchema.safeParse(purchase).success);
  assertRejection(createCreditPurchaseRequestSchema.safeParse({ ...purchase, dueDate: "soon" }), {
    path: ["dueDate"],
  });
  assertRejection(createCreditPurchaseRequestSchema.safeParse({ ...purchase, supplierRef: "" }), {
    path: ["supplierRef"],
  });

  assert.ok(
    createCreditPurchasePaymentRequestSchema.safeParse({
      amountMinor: "100",
      sourceKind: "petty_cash",
      idempotencyKey: "k",
    }).success,
  );
  assertRejection(
    createCreditPurchasePaymentRequestSchema.safeParse({
      amountMinor: "100",
      sourceKind: "",
      idempotencyKey: "k",
    }),
    { path: ["sourceKind"] },
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
  assertRejection(onBehalfPaymentListSchema.safeParse([{ ...row, status: "weird" }]), {
    path: [0, "status"],
  });
  assertRejection(onBehalfPaymentSummarySchema.safeParse({ ...row, approvalsHave: 1 }), {
    code: "unrecognized_keys",
  });
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
