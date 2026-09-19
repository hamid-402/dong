import assert from "node:assert/strict";
import test from "node:test";
import { expenseListQuerySchema } from "@dang/contracts";

test("expense list query accepts catalogItemId", () => {
  const parsed = expenseListQuerySchema.parse({
    from: "2026-01-01",
    to: "2026-01-31",
    catalogItemId: "cat-bread",
  });
  assert.equal(parsed.catalogItemId, "cat-bread");
});

test("expense list query accepts q, paidByUserId, categoryId, tagId", () => {
  const parsed = expenseListQuerySchema.parse({
    q: "ناهار",
    paidByUserId: "user-1",
    categoryId: "cat-food",
    tagId: "tag-lunch",
  });
  assert.equal(parsed.q, "ناهار");
  assert.equal(parsed.paidByUserId, "user-1");
  assert.equal(parsed.categoryId, "cat-food");
  assert.equal(parsed.tagId, "tag-lunch");
});

test("expense list query rejects from after to", () => {
  assert.throws(() =>
    expenseListQuerySchema.parse({
      from: "2026-02-01",
      to: "2026-01-01",
    }),
  );
});
