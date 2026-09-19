import assert from "node:assert/strict";
import test from "node:test";
import { allocateItemizedSplit } from "@dang/contracts";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { MemoryExpenseTagsStore } from "./expense-tags.store.js";

test("G03 lunch itemized: shared appetizer + personal mains allocate to payers", async () => {
  const store = new MemoryExpenseStore();
  const alice = "alice";
  const bob = "bob";
  const items = [
    {
      title: "پیش‌غذا مشترک",
      amount: { amountMinor: "200000", currency: "IRR" as const },
      assigneeUserIds: [alice, bob],
    },
    {
      title: "خوراک علی",
      amount: { amountMinor: "350000", currency: "IRR" as const },
      assigneeUserIds: [alice],
    },
    {
      title: "خوراک بابک",
      amount: { amountMinor: "280000", currency: "IRR" as const },
      assigneeUserIds: [bob],
    },
  ];
  const tip = { amountMinor: "50000", currency: "IRR" as const };
  const allocated = allocateItemizedSplit({ items, tip });
  const total = BigInt(allocated.total.amountMinor);
  assert.equal(total, 200000n + 350000n + 280000n + 50000n);

  const draft = await store.createDraft(alice, {
    workspaceId: "ws-lunch",
    title: "ناهار تیم",
    total: allocated.total,
    paidByUserId: alice,
    splitMethod: "itemized",
    participantUserIds: [alice, bob],
    items,
    tip,
    occurredOn: "2026-09-19",
    idempotencyKey: "lunch-1",
  });
  assert.equal(draft.splitMethod, "itemized");
  assert.equal(draft.items?.length, 3);
  assert.ok(draft.splits.length >= 2);
  const sumSplits = draft.splits.reduce(
    (s, line) => s + BigInt(line.amount.amountMinor),
    0n,
  );
  assert.equal(sumSplits, total);
});

test("G03 tags: create + link + filter expense ids", async () => {
  const tags = new MemoryExpenseTagsStore();
  const tag = await tags.create("ws1", "u1", {
    name: "ناهار",
    idempotencyKey: "t1",
  });
  await tags.setExpenseTags("ws1", "exp-a", "u1", [tag.id]);
  await tags.setExpenseTags("ws1", "exp-b", "u1", []);
  const matched = await tags.listExpenseIdsWithTag("ws1", tag.id);
  assert.deepEqual(matched, ["exp-a"]);
  const linked = await tags.listTagIdsForExpense("ws1", "exp-a");
  assert.deepEqual(linked, [tag.id]);
});
