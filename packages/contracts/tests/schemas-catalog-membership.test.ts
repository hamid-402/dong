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

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

test("catalog unit schema enforces code format", () => {
  const ok = { code: "kg_2", labelFa: "کیلو", labelEn: "kilogram", kind: "weight" };
  assert.ok(createCatalogUnitRequestSchema.safeParse(ok).success);
  assert.ok(createCatalogUnitRequestSchema.safeParse({ ...ok, baseCode: "g", baseFactor: "1000.5" }).success);
  assert.equal(createCatalogUnitRequestSchema.safeParse({ ...ok, code: "Kg" }).success, false);
  assert.equal(createCatalogUnitRequestSchema.safeParse({ ...ok, code: "1kg" }).success, false);
  assert.equal(createCatalogUnitRequestSchema.safeParse({ ...ok, kind: "mass" }).success, false);
  assert.equal(createCatalogUnitRequestSchema.safeParse({ ...ok, baseFactor: "-1" }).success, false);
});

test("catalog category schemas", () => {
  assert.ok(createCatalogCategoryRequestSchema.safeParse({ name: "Food", parentId: U1, sortOrder: 3 }).success);
  assert.equal(createCatalogCategoryRequestSchema.safeParse({ name: "Food", parentId: "x" }).success, false);
  assert.equal(createCatalogCategoryRequestSchema.safeParse({ name: "Food", sortOrder: -1 }).success, false);
  assert.ok(updateCatalogCategoryRequestSchema.safeParse({ active: false }).success);
  assert.equal(updateCatalogCategoryRequestSchema.safeParse({ name: "" }).success, false);
});

test("catalog item schemas validate reference price range", () => {
  const ok = { name: "Rice", unitCode: "kg", referencePriceMinor: "125000" };
  assert.ok(createCatalogItemRequestSchema.safeParse(ok).success);
  assert.equal(createCatalogItemRequestSchema.safeParse({ ...ok, referencePriceMinor: "0" }).success, false);
  assert.equal(createCatalogItemRequestSchema.safeParse({ ...ok, referencePriceMinor: "-5" }).success, false);
  assert.equal(
    createCatalogItemRequestSchema.safeParse({ ...ok, referencePriceMinor: MAX_AMOUNT_MINOR.toString() }).success,
    false,
  );
  assert.ok(updateCatalogItemRequestSchema.safeParse({ sku: null, barcode: null, description: null, categoryId: null }).success);
  assert.equal(updateCatalogItemRequestSchema.safeParse({ categoryId: "nope" }).success, false);
});

test("catalog pin/import/list-query schemas", () => {
  assert.ok(replaceCatalogPinsRequestSchema.safeParse({ itemIds: [U1, U2] }).success);
  assert.equal(replaceCatalogPinsRequestSchema.safeParse({ itemIds: ["x"] }).success, false);
  assert.equal(
    replaceCatalogPinsRequestSchema.safeParse({ itemIds: Array.from({ length: 201 }, () => U1) }).success,
    false,
  );
  assert.ok(importPersonalCatalogRequestSchema.safeParse({}).success);

  assert.equal(listCatalogItemsQuerySchema.parse({}).activeOnly, true);
  assert.equal(listCatalogItemsQuerySchema.parse({ activeOnly: "false" }).activeOnly, false);
  assert.equal(listCatalogItemsQuerySchema.parse({ activeOnly: "true" }).activeOnly, true);
  assert.equal(listCatalogItemsQuerySchema.parse({ activeOnly: false }).activeOnly, false);
  assert.equal(listCatalogItemsQuerySchema.parse({ limit: "25" }).limit, 25);
  assert.equal(listCatalogItemsQuerySchema.safeParse({ limit: "0" }).success, false);
  assert.equal(listCatalogItemsQuerySchema.safeParse({ activeOnly: "maybe" }).success, false);
});

test("membership schemas", () => {
  assert.ok(addWorkspaceMemberRequestSchema.safeParse({ userId: U1, role: "member", defaultShares: 2 }).success);
  assert.equal(addWorkspaceMemberRequestSchema.safeParse({ userId: "u1", role: "member" }).success, false);
  assert.equal(addWorkspaceMemberRequestSchema.safeParse({ userId: U1, role: "member", defaultShares: 0 }).success, false);

  const empty = updateWorkspaceMemberRequestSchema.safeParse({});
  assert.equal(empty.success, false);
  assert.equal(empty.error?.issues[0]?.message, "role_or_defaultShares_required");
  assert.ok(updateWorkspaceMemberRequestSchema.safeParse({ defaultShares: 3 }).success);

  assert.ok(disableWorkspaceMemberRequestSchema.safeParse({ reason: "left" }).success);
  assert.equal(disableWorkspaceMemberRequestSchema.safeParse({ reason: " " }).success, false);
  assert.ok(createJoinRequestSchema.safeParse({}).success);
  assert.equal(createJoinRequestSchema.safeParse({ message: "x".repeat(501) }).success, false);
  assert.equal(approveJoinRequestSchema.safeParse({}).success, false);
  assert.ok(proposeOwnershipTransferSchema.safeParse({ toUserId: U2 }).success);
  assert.equal(proposeOwnershipTransferSchema.safeParse({ toUserId: "bob" }).success, false);
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
  assert.equal(updateMoneyIntentRequestSchema.safeParse({ targetMinor: "0" }).success, false);
  assert.equal(updateMoneyIntentRequestSchema.safeParse({ kind: "spend_cap_amount" }).success, false);
});

test("base money schemas", () => {
  assert.ok(moneySchema.safeParse({ amountMinor: "1", currency: "IRR" }).success);
  assert.equal(moneySchema.safeParse({ amountMinor: "0", currency: "IRR" }).success, false);
  assert.equal(moneySchema.safeParse({ amountMinor: "1", currency: "USD" }).success, false);
  assert.ok(nonNegativeMoneySchema.safeParse({ amountMinor: "0", currency: "IRR" }).success);
  assert.equal(nonNegativeMoneySchema.safeParse({ amountMinor: "-1", currency: "IRR" }).success, false);
  assert.equal(
    nonNegativeMoneySchema.safeParse({ amountMinor: MAX_AMOUNT_MINOR.toString(), currency: "IRR" }).success,
    false,
  );
  assert.ok(isoDateSchema.safeParse("2026-03-01").success);
  assert.equal(isoDateSchema.safeParse("2026-3-1").success, false);
  assert.ok(yearMonthSchema.safeParse("2026-03").success);
  assert.equal(yearMonthSchema.safeParse("2026-03-01").success, false);
  assert.equal(idempotencyKeySchema.safeParse("  ").success, false);
});
