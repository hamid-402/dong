import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAllowanceStore } from "./memory-allowance.store.js";

test("memory allowance store creates and lists active allowance", async () => {
  const store = new MemoryAllowanceStore();
  const created = await store.create("workspace-1", "manager-1", {
    memberUserId: "member-1",
    periodKind: "month",
    limit: { amountMinor: "500000", currency: "IRR" },
    idempotencyKey: "allowance-test-1",
  });
  const rows = await store.list("workspace-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, created.id);
  assert.equal(rows[0]?.limit.amountMinor, "500000");
});
