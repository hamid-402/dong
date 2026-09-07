import assert from "node:assert/strict";
import test from "node:test";
import { isFinanceManagerRole } from "@dang/contracts";
import { MemorySettlementStore } from "./memory-settlement.store.js";

test("settlement store get returns createdBy for ACL", async () => {
  const store = new MemorySettlementStore();
  const created = await store.createClaim("alice", {
    workspaceId: "ws1",
    fromUserId: "bob",
    toUserId: "alice",
    amount: { amountMinor: "1000", currency: "IRR" },
    idempotencyKey: "s1",
  });
  const loaded = await store.get("ws1", created.id, "alice");
  assert.equal(loaded?.createdByUserId, "alice");
  assert.equal(loaded?.toUserId, "alice");
});

test("finance manager role helper matches owner/admin/finance", () => {
  assert.equal(isFinanceManagerRole("member"), false);
  assert.equal(isFinanceManagerRole("finance"), true);
  assert.equal(isFinanceManagerRole("owner"), true);
});
