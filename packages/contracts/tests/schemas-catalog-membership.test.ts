import assert from "node:assert/strict";
import test from "node:test";
import {
  createCatalogCategoryRequestSchema,
  createCatalogItemRequestSchema,
  createCatalogUnitRequestSchema,
  importPersonalCatalogRequestSchema,
  listCatalogItemsQuerySchema,
  replaceCatalogPinsRequestSchema,
  updateCatalogCategoryRequestSchema,
  updateCatalogItemRequestSchema,
} from "../src/schemas/catalog.js";
import {
  addWorkspaceMemberRequestSchema,
  approveJoinRequestSchema,
  createJoinRequestSchema,
  disableWorkspaceMemberRequestSchema,
  proposeOwnershipTransferSchema,
  updateWorkspaceMemberRequestSchema,
} from "../src/schemas/membership.js";
import {
  createMoneyIntentRequestSchema,
  updateMoneyIntentRequestSchema,
} from "../src/schemas/money-intent.js";
import {
  MAX_AMOUNT_MINOR,
  idempotencyKeySchema,
  isoDateSchema,
  moneySchema,
  nonNegativeMoneySchema,
  yearMonthSchema,
} from "../src/schemas/money.js";
import { assertRejection } from "./assert-rejection.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

test("catalog unit schema enforces code format", () => {
  const ok = { code: "kg_2", labelFa: "کیلو", labelEn: "kilogram", kind: "weight" };
  assert.ok(createCatalogUnitRequestSchema.safeParse(ok).success);
  assert.ok(createCatalogUnitRequestSchema.safeParse({ ...ok, baseCode: "g", baseFactor: "1000.5" }).success);
  assertRejection(createCatalogUnitRequestSchema.safeParse({ ...ok, code: "Kg" }), {
    path: ["code"],
    message: "UNIT_CODE_FORMAT",
  });
  assertRejection(createCatalogUnitRequestSchema.safeParse({ ...ok, code: "1kg" }), {
    path: ["code"],
    message: "UNIT_CODE_FORMAT",
  });
  assertRejection(createCatalogUnitRequestSchema.safeParse({ ...ok, kind: "mass" }), {
    path: ["kind"],
  });
  assertRejection(createCatalogUnitRequestSchema.safeParse({ ...ok, baseFactor: "-1" }), {
    path: ["baseFactor"],
  });
});

test("catalog category schemas", () => {
  assert.ok(createCatalogCategoryRequestSchema.safeParse({ name: "Food", parentId: U1, sortOrder: 3 }).success);
  assertRejection(createCatalogCategoryRequestSchema.safeParse({ name: "Food", parentId: "x" }), {
    path: ["parentId"],
  });
  assertRejection(createCatalogCategoryRequestSchema.safeParse({ name: "Food", sortOrder: -1 }), {
    path: ["sortOrder"],
  });
  assert.ok(updateCatalogCategoryRequestSchema.safeParse({ active: false }).success);
  assertRejection(updateCatalogCategoryRequestSchema.safeParse({ name: "" }), {
    path: ["name"],
  });
});

test("catalog item schemas validate reference price range", () => {
  const ok = { name: "Rice", unitCode: "kg", referencePriceMinor: "125000" };
  assert.ok(createCatalogItemRequestSchema.safeParse(ok).success);
  assertRejection(createCatalogItemRequestSchema.safeParse({ ...ok, referencePriceMinor: "0" }), {
    path: ["referencePriceMinor"],
  });
  assertRejection(createCatalogItemRequestSchema.safeParse({ ...ok, referencePriceMinor: "-5" }), {
    path: ["referencePriceMinor"],
  });
  assertRejection(
    createCatalogItemRequestSchema.safeParse({ ...ok, referencePriceMinor: MAX_AMOUNT_MINOR.toString() }),
    { path: ["referencePriceMinor"] },
  );
  assert.ok(updateCatalogItemRequestSchema.safeParse({ sku: null, barcode: null, description: null, categoryId: null }).success);
  assertRejection(updateCatalogItemRequestSchema.safeParse({ categoryId: "nope" }), {
    path: ["categoryId"],
  });
});

test("catalog pin/import/list-query schemas", () => {
  assert.ok(replaceCatalogPinsRequestSchema.safeParse({ itemIds: [U1, U2] }).success);
  assertRejection(replaceCatalogPinsRequestSchema.safeParse({ itemIds: ["x"] }), {
    path: ["itemIds", 0],
  });
  assertRejection(
    replaceCatalogPinsRequestSchema.safeParse({ itemIds: Array.from({ length: 201 }, () => U1) }),
    { path: ["itemIds"] },
  );
  assert.ok(importPersonalCatalogRequestSchema.safeParse({}).success);

  assert.equal(listCatalogItemsQuerySchema.parse({}).activeOnly, true);
  assert.equal(listCatalogItemsQuerySchema.parse({ activeOnly: "false" }).activeOnly, false);
  assert.equal(listCatalogItemsQuerySchema.parse({ activeOnly: "true" }).activeOnly, true);
  assert.equal(listCatalogItemsQuerySchema.parse({ activeOnly: false }).activeOnly, false);
  assert.equal(listCatalogItemsQuerySchema.parse({ limit: "25" }).limit, 25);
  assertRejection(listCatalogItemsQuerySchema.safeParse({ limit: "0" }), {
    path: ["limit"],
  });
  assertRejection(listCatalogItemsQuerySchema.safeParse({ activeOnly: "maybe" }), {
    path: ["activeOnly"],
  });
});

test("membership schemas", () => {
  assert.ok(addWorkspaceMemberRequestSchema.safeParse({ userId: U1, role: "member", defaultShares: 2 }).success);
  assertRejection(addWorkspaceMemberRequestSchema.safeParse({ userId: "u1", role: "member" }), {
    path: ["userId"],
  });
  assertRejection(
    addWorkspaceMemberRequestSchema.safeParse({ userId: U1, role: "member", defaultShares: 0 }),
    { path: ["defaultShares"] },
  );

  const empty = updateWorkspaceMemberRequestSchema.safeParse({});
  assertRejection(empty, { message: "role_or_defaultShares_required" });
  assert.ok(updateWorkspaceMemberRequestSchema.safeParse({ defaultShares: 3 }).success);

  assert.ok(disableWorkspaceMemberRequestSchema.safeParse({ reason: "left" }).success);
  assertRejection(disableWorkspaceMemberRequestSchema.safeParse({ reason: " " }), {
    path: ["reason"],
  });
  assert.ok(createJoinRequestSchema.safeParse({}).success);
  assertRejection(createJoinRequestSchema.safeParse({ message: "x".repeat(501) }), {
    path: ["message"],
  });
  assertRejection(approveJoinRequestSchema.safeParse({}), { path: ["role"] });
  assert.ok(proposeOwnershipTransferSchema.safeParse({ toUserId: U2 }).success);
  assertRejection(proposeOwnershipTransferSchema.safeParse({ toUserId: "bob" }), {
    path: ["toUserId"],
  });
});

test("money-intent create schema requires kind-specific targets", () => {
  const msgs = (v: unknown) => {
    const r = createMoneyIntentRequestSchema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };
  const base = { name: "Cap", idempotencyKey: "k" };
  assert.deepEqual(msgs({ ...base, kind: "spend_cap_amount" }), ["INTENT_AMOUNT"]);
  assert.deepEqual(msgs({ ...base, kind: "spend_cap_amount", targetMinor: "100" }), []);
  assert.deepEqual(msgs({ ...base, kind: "save_income_percent" }), ["INTENT_PERCENT"]);
  assert.deepEqual(msgs({ ...base, kind: "save_income_percent", targetPercent: 10 }), []);
  assert.deepEqual(msgs({ ...base, kind: "savings_goal_link" }), ["INTENT_PERCENT", "INTENT_GOAL"]);
  assert.deepEqual(msgs({ ...base, kind: "savings_goal_link", targetPercent: 5, goalId: "g1" }), []);
  assert.ok(msgs({ ...base, kind: "spend_cap_amount", targetMinor: "0" }).length > 0);
  assert.ok(msgs({ ...base, kind: "save_income_percent", targetPercent: 101 }).length > 0);
});

test("money-intent update schema allows clearing targets", () => {
  assert.ok(updateMoneyIntentRequestSchema.safeParse({ targetMinor: null, targetPercent: null, goalId: null }).success);
  assert.ok(updateMoneyIntentRequestSchema.safeParse({ active: false, name: "x" }).success);
  assertRejection(updateMoneyIntentRequestSchema.safeParse({ targetMinor: "0" }), {
    path: ["targetMinor"],
    message: "target_RANGE",
  });
  assertRejection(updateMoneyIntentRequestSchema.safeParse({ kind: "spend_cap_amount" }), {
    code: "unrecognized_keys",
  });
});

test("base money schemas", () => {
  assert.ok(moneySchema.safeParse({ amountMinor: "1", currency: "IRR" }).success);
  assertRejection(moneySchema.safeParse({ amountMinor: "0", currency: "IRR" }), {
    path: ["amountMinor"],
    message: "amount_RANGE",
  });
  assertRejection(moneySchema.safeParse({ amountMinor: "1", currency: "USD" }), {
    path: ["currency"],
  });
  assert.ok(nonNegativeMoneySchema.safeParse({ amountMinor: "0", currency: "IRR" }).success);
  assertRejection(nonNegativeMoneySchema.safeParse({ amountMinor: "-1", currency: "IRR" }), {
    path: ["amountMinor"],
  });
  assertRejection(
    nonNegativeMoneySchema.safeParse({ amountMinor: MAX_AMOUNT_MINOR.toString(), currency: "IRR" }),
    { path: ["amountMinor"] },
  );
  assert.ok(isoDateSchema.safeParse("2026-03-01").success);
  assertRejection(isoDateSchema.safeParse("2026-3-1"), { message: "date_FORMAT" });
  assert.ok(yearMonthSchema.safeParse("2026-03").success);
  assertRejection(yearMonthSchema.safeParse("2026-03-01"), { message: "yearMonth_FORMAT" });
  assertRejection(idempotencyKeySchema.safeParse("  "), { code: "too_small" });
});
