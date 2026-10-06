import assert from "node:assert/strict";
import test from "node:test";
import {
  appendExpenseReverseMeta,
  parseExpenseReverseMeta,
  stripExpenseReverseMeta,
} from "./expense-reverse-meta.js";

test("append + parse reverse meta round-trip", () => {
  const note = appendExpenseReverseMeta("یادداشت کاربر", {
    reversedByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reversedAt: "2026-09-26T12:00:00.000Z",
    reverseReason: "mistaken_entry",
  });
  const meta = parseExpenseReverseMeta(note);
  assert.ok(meta);
  assert.equal(meta!.reversedByUserId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(meta!.reverseReason, "mistaken_entry");
  assert.equal(stripExpenseReverseMeta(note), "یادداشت کاربر");
});

test("parse returns null without marker", () => {
  assert.equal(parseExpenseReverseMeta("فقط متن"), null);
});
