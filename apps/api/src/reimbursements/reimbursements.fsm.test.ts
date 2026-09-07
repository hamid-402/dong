import assert from "node:assert/strict";
import test from "node:test";
import { MemoryReimbursementStore } from "./memory-reimbursement.store.js";

test("reimbursement memory store enforces FSM transitions", async () => {
  const store = new MemoryReimbursementStore();
  const row = await store.create("w1", "u1", {
    title: "Taxi", amountMinor: "1200", idempotencyKey: "r1",
  });
  assert.equal(row.status, "draft");
  const submitted = await store.transition("w1", row.id, "u1", ["draft"], "submitted");
  assert.equal(submitted.status, "submitted");
  const approved = await store.transition("w1", row.id, "finance", ["submitted"], "approved");
  assert.equal(approved.status, "approved");
  const paid = await store.transition("w1", row.id, "finance", ["approved"], "paid");
  assert.equal(paid.status, "paid");
  await assert.rejects(
    store.transition("w1", row.id, "u1", ["draft"], "cancelled"),
    /REIMBURSEMENT_STATUS/,
  );
});
