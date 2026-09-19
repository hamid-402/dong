import assert from "node:assert/strict";
import test from "node:test";
import { resolveMessagingProvider } from "./messaging.types.js";
import { createMessagingAdapter, StubMessagingAdapter } from "./messaging.adapters.js";

test("messaging: stub when no bot tokens", () => {
  assert.equal(resolveMessagingProvider({}), "stub");
  assert.ok(createMessagingAdapter({}) instanceof StubMessagingAdapter);
});

test("messaging: telegram only when token present", () => {
  assert.equal(
    resolveMessagingProvider({ TELEGRAM_BOT_TOKEN: "tok", MESSAGING_PROVIDER: "telegram" }),
    "telegram",
  );
  assert.equal(resolveMessagingProvider({ MESSAGING_PROVIDER: "telegram" }), "stub");
});

test("messaging: none when forced", () => {
  assert.equal(resolveMessagingProvider({ MESSAGING_PROVIDER: "none" }), "none");
});

test("messaging: stub send succeeds without network", async () => {
  const stub = new StubMessagingAdapter();
  const result = await stub.send({
    workspaceId: "ws1",
    userId: "u1",
    title: "t",
    body: "b",
  });
  assert.equal(result.ok, true);
  assert.equal(result.channel, "stub");
});
