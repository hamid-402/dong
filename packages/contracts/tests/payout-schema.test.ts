import assert from "node:assert/strict";
import test from "node:test";
import { upsertWorkspacePayoutInstructionsSchema } from "../src/index.js";

test("payout schema accepts valid card and iban", () => {
  assert.equal(
    upsertWorkspacePayoutInstructionsSchema.safeParse({
      holderName: "علی",
      destinationKind: "card",
      destinationValue: "6037997188123456",
    }).success,
    true,
  );
  assert.equal(
    upsertWorkspacePayoutInstructionsSchema.safeParse({
      holderName: "علی",
      destinationKind: "iban",
      destinationValue: "IR120170000000123456789001",
    }).success,
    true,
  );
});

test("payout schema rejects invalid card/iban", () => {
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
      destinationValue: "IR12",
    }).success,
    false,
  );
});
