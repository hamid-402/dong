import assert from "node:assert/strict";
import test from "node:test";
import { upsertWorkspacePayoutInstructionsSchema } from "../src/index.js";

test("payout schema accepts a checked card and sheba and fills the bank name", () => {
  const card = upsertWorkspacePayoutInstructionsSchema.safeParse({
    holderName: "علی",
    destinationKind: "card",
    destinationValue: "6037-9971-8812-3450",
  });
  assert.equal(card.success, true);
  if (card.success) {
    assert.equal(card.data.destinationValue, "6037997188123450");
    assert.equal(card.data.bankName, "بانک ملی ایران");
  }

  const iban = upsertWorkspacePayoutInstructionsSchema.safeParse({
    holderName: "علی",
    destinationKind: "iban",
    destinationValue: "ir27 0170 0000 0010 0324 2000 01",
  });
  assert.equal(iban.success, true);
  if (iban.success) {
    assert.equal(iban.data.destinationValue, "IR270170000000100324200001");
    assert.equal(iban.data.bankName, "بانک ملی ایران");
  }
});

test("payout schema keeps a name the user typed", () => {
  const card = upsertWorkspacePayoutInstructionsSchema.safeParse({
    holderName: "علی",
    destinationKind: "card",
    destinationValue: "6037997188123450",
    bankName: "حساب مشترک خانواده",
  });
  assert.equal(card.success, true);
  if (card.success) assert.equal(card.data.bankName, "حساب مشترک خانواده");
});

test("payout schema rejects a bad check digit and a short value", () => {
  assert.equal(
    upsertWorkspacePayoutInstructionsSchema.safeParse({
      holderName: "علی",
      destinationKind: "card",
      destinationValue: "6037997188123451",
    }).success,
    false,
  );
  assert.equal(
    upsertWorkspacePayoutInstructionsSchema.safeParse({
      holderName: "علی",
      destinationKind: "card",
      destinationValue: "1234",
    }).success,
    false,
  );
  assert.equal(
    upsertWorkspacePayoutInstructionsSchema.safeParse({
      holderName: "علی",
      destinationKind: "iban",
      destinationValue: "IR120170000000123456789001",
    }).success,
    false,
  );
});
