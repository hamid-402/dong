import assert from "node:assert/strict";
import test from "node:test";
import {
  createExpenseDraftSchema,
  moneySchema,
  previewExpenseSplitSchema,
} from "../src/schemas/index.js";
import { assertRejection } from "./assert-rejection.js";

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
  assertRejection(moneySchema.safeParse({ amountMinor: "0", currency: "IRR" }), {
    path: ["amountMinor"],
    message: "amount_RANGE",
  });
  assertRejection(moneySchema.safeParse({ amountMinor: "-5", currency: "IRR" }), {
    path: ["amountMinor"],
    message: "amount_FORMAT",
  });
  assertRejection(moneySchema.safeParse({ amountMinor: "1.5", currency: "IRR" }), {
    path: ["amountMinor"],
    message: "amount_FORMAT",
  });
  assertRejection(moneySchema.safeParse({ amountMinor: "10000", currency: "USD" }), {
    path: ["currency"],
  });
});

test("createExpenseDraftSchema rejects mass-assignment unknown keys", () => {
  const result = createExpenseDraftSchema.safeParse({
    ...baseDraft,
    status: "posted",
    createdByUserId: "attacker",
  });
  assertRejection(result, { code: "unrecognized_keys" });
});

test("createExpenseDraftSchema rejects bad amountMinor", () => {
  assertRejection(
    createExpenseDraftSchema.safeParse({
      ...baseDraft,
      total: { amountMinor: "-5", currency: "IRR" },
    }),
    { path: ["total", "amountMinor"], message: "amount_FORMAT" },
  );
});

test("createExpenseDraftSchema accepts equal split draft", () => {
  const result = createExpenseDraftSchema.safeParse(baseDraft);
  assert.equal(result.success, true);
});

test("createExpenseDraftSchema rejects AMOUNT_MISMATCH on catalog line", () => {
  const result = createExpenseDraftSchema.safeParse({
    ...baseDraft,
    splitMethod: "itemized",
    participantUserIds: [],
    items: [
      {
        title: "نوشابه",
        amount: { amountMinor: "100000", currency: "IRR" },
        assigneeUserIds: ["alice"],
        catalogItemId: "item-1",
        unitCode: "piece",
        quantity: 2,
        unitPriceMinor: "300000",
      },
    ],
    total: { amountMinor: "600000", currency: "IRR" },
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    assert.ok(messages.includes("AMOUNT_MISMATCH"));
  }
});

test("createExpenseDraftSchema accepts matching catalog quantity × price", () => {
  const result = createExpenseDraftSchema.safeParse({
    ...baseDraft,
    splitMethod: "itemized",
    participantUserIds: [],
    items: [
      {
        title: "نوشابه",
        amount: { amountMinor: "600000", currency: "IRR" },
        assigneeUserIds: ["alice"],
        catalogItemId: "item-1",
        unitCode: "piece",
        quantity: 2,
        unitPriceMinor: "300000",
      },
    ],
    total: { amountMinor: "600000", currency: "IRR" },
  });
  assert.equal(result.success, true);
});

test("previewExpenseSplitSchema rejects empty participants for equal", () => {
  assertRejection(
    previewExpenseSplitSchema.safeParse({
      total: { amountMinor: "100", currency: "IRR" },
      splitMethod: "equal",
      participantUserIds: [],
    }),
    { path: ["participantUserIds"], message: "EXPENSE_PARTICIPANTS" },
  );
});
