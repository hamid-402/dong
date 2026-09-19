import assert from "node:assert/strict";
import test from "node:test";
import { computeAuditEventHash, verifyAuditEventHash } from "@dang/contracts";
import { MemoryAuditStore } from "./memory-audit.store.js";

test("computeAuditEventHash is stable and verifies", () => {
  const input = {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    actorUserId: "33333333-3333-4333-8333-333333333333",
    action: "expense.post",
    targetType: "expense",
    targetId: "44444444-4444-4444-8444-444444444444",
    result: "success",
    occurredAtIso: "2026-09-12T10:00:00.000Z",
    prevHash: null as string | null,
  };
  const h1 = computeAuditEventHash(input);
  const h2 = computeAuditEventHash(input);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.equal(verifyAuditEventHash(input, h1), true);
  assert.equal(verifyAuditEventHash({ ...input, action: "other" }, h1), false);
});

test("memory audit store chains prev_hash", async () => {
  const store = new MemoryAuditStore();
  await store.append({
    workspaceId: "ws1",
    actorUserId: "u1",
    action: "a1",
    targetType: "t",
    result: "success",
  });
  await store.append({
    workspaceId: "ws1",
    actorUserId: "u1",
    action: "a2",
    targetType: "t",
    result: "success",
  });
  const chain = store.chainForWorkspace("ws1");
  assert.equal(chain.length, 2);
  assert.equal(chain[0]?.prevHash, null);
  assert.equal(chain[1]?.prevHash, chain[0]?.eventHash);
  assert.notEqual(chain[0]?.eventHash, chain[1]?.eventHash);
});
