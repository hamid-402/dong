import assert from "node:assert/strict";
import test from "node:test";
import { signWebhookBody, verifyWebhookSignature } from "@dang/contracts";
import { MemoryWorkspaceWebhookStore } from "./memory-webhook.store.js";

test("webhook HMAC sign/verify (G12 #58)", () => {
  const secret = "test-secret-at-least-16";
  const ts = "1710000000000";
  const body = JSON.stringify({ type: "expense.posted", data: { expenseId: "e1" } });
  const sig = signWebhookBody(secret, ts, body);
  assert.equal(verifyWebhookSignature({ secret, timestamp: ts, body, signature: sig }), true);
  assert.equal(
    verifyWebhookSignature({ secret, timestamp: ts, body, signature: "deadbeef" }),
    false,
  );
});

test("webhook store lists active by event", async () => {
  const store = new MemoryWorkspaceWebhookStore();
  await store.create("u1", {
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    url: "https://example.com/hook",
    events: ["expense.posted"],
    secret: "secret-sixteen-xx",
    idempotencyKey: "idem-1",
  });
  const active = await store.getActiveForEvent(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "expense.posted",
  );
  assert.equal(active.length, 1);
  const none = await store.getActiveForEvent(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "settlement.confirmed",
  );
  assert.equal(none.length, 0);
});
