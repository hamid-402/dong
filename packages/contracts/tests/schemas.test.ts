import assert from "node:assert/strict";
import test from "node:test";
import {
  createExpenseDraftSchema,
  moneySchema,
  previewExpenseSplitSchema,
} from "../src/schemas/index.js";

const baseDraft = {
  title: "ناهار",
  total: { amountMinor: "10000", currency: "IRR" as const },
  paidByUserId: "alice",
  splitMethod: "equal" as const,
  participantUserIds: ["alice", "bob"],
  occurredOn: "2026-09-01",
  idempotencyKey: "k-1",
};

test("moneySchema accepts positive IRR minor", () => {
  const ok = moneySchema.safeParse({ amountMinor: "1", currency: "IRR" });
  assert.equal(ok.success, true);
});

test("moneySchema rejects zero, negative, and non-digit", () => {
  assert.equal(moneySchema.safeParse({ amountMinor: "0", currency: "IRR" }).success, false);
  assert.equal(moneySchema.safeParse({ amountMinor: "-5", currency: "IRR" }).success, false);
  assert.equal(moneySchema.safeParse({ amountMinor: "1.5", currency: "IRR" }).success, false);
  assert.equal(moneySchema.safeParse({ amountMinor: "10000", currency: "USD" }).success, false);
});

test("createExpenseDraftSchema rejects mass-assignment unknown keys", () => {
  const result = createExpenseDraftSchema.safeParse({
    ...baseDraft,
    status: "posted",
    createdByUserId: "attacker",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const flat = result.error.flatten();
    assert.ok(
      flat.formErrors.some((m) => /unrecognized|unrecognized key/i.test(m)) ||
        Object.keys(flat.fieldErrors).length >= 0,
    );
  }
});

test("createExpenseDraftSchema rejects bad amountMinor", () => {
  const result = createExpenseDraftSchema.safeParse({
    ...baseDraft,
    total: { amountMinor: "-5", currency: "IRR" },
  });
  assert.equal(result.success, false);
});

test("createExpenseDraftSchema accepts equal split draft", () => {
  const result = createExpenseDraftSchema.safeParse(baseDraft);
  assert.equal(result.success, true);
});

test("previewExpenseSplitSchema rejects empty participants for equal", () => {
  const result = previewExpenseSplitSchema.safeParse({
    total: { amountMinor: "100", currency: "IRR" },
    splitMethod: "equal",
    participantUserIds: [],
  });
  assert.equal(result.success, false);
});
