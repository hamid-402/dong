import assert from "node:assert/strict";
import test from "node:test";
import type { CreateExpenseDraftRequest } from "@dang/contracts";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { appendExpenseReverseMeta, parseExpenseReverseMeta } from "./expense-reverse-meta.js";
import { toExpenseSummary } from "./expense.types.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const alice = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("reverse persists meta; hardDelete removes reversed row", async () => {
  const store = new MemoryExpenseStore();
  const created = await store.createDraft(alice, {
    workspaceId,
    title: "نان",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: alice,
    splitMethod: "equal",
    participantUserIds: [alice, bob],
    occurredOn: "2026-09-12",
    idempotencyKey: "rev-meta-1",
  } satisfies CreateExpenseDraftRequest);

  const reversed = await store.reverse(workspaceId, created.id, alice, {
    reverseReason: "mistaken_entry",
  });
  assert.equal(reversed.status, "reversed");
  const summary = toExpenseSummary(reversed);
  assert.equal(summary.reverseReason, "mistaken_entry");
  assert.equal(summary.reversedByUserId, alice);
  assert.ok(summary.reversedAt);

  await store.hardDelete(workspaceId, created.id, alice);
  const gone = await store.get(workspaceId, created.id, alice);
  assert.equal(gone, null);
});

test("append meta keeps user note readable", () => {
  const note = appendExpenseReverseMeta("یادداشت", {
    reversedByUserId: alice,
    reversedAt: "2026-09-26T10:00:00.000Z",
    reverseReason: "duplicate",
  });
  assert.equal(parseExpenseReverseMeta(note)?.reverseReason, "duplicate");
});
