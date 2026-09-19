import assert from "node:assert/strict";
import { test } from "node:test";
import type { NotificationSummary } from "@dang/contracts";
import { RealtimeHub } from "./realtime-hub.js";

const sample: NotificationSummary = {
  id: "n1",
  workspaceId: "w1",
  userId: "u1",
  channel: "in_app",
  title: "t",
  body: "b",
  createdAt: new Date().toISOString(),
};

test("RealtimeHub delivers notification to subscriber (R10-18)", async () => {
  const hub = new RealtimeHub();
  const got: unknown[] = [];
  const unsub = hub.subscribe("w1", "u1", (e) => got.push(e));
  hub.publishNotification(sample);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { type: "notification", notification: sample });
  unsub();
  hub.publishNotification(sample);
  assert.equal(got.length, 1);
});

test("data.invalidate reaches only the members named in the event", async () => {
  const hub = new RealtimeHub();
  const alice: unknown[] = [];
  const bob: unknown[] = [];
  const carol: unknown[] = [];
  const stops = [
    hub.subscribe("w1", "alice", (e) => alice.push(e)),
    hub.subscribe("w1", "bob", (e) => bob.push(e)),
    hub.subscribe("w1", "carol", (e) => carol.push(e)),
  ];

  hub.publishInvalidate("w1", ["alice", "bob", "alice"], [
    "balances",
    "invoices:p1",
  ]);

  const received = alice.filter(
    (envelope) => (envelope as { type: string }).type === "data.invalidate",
  );
  assert.equal(received.length, 1, "duplicate member ids must not duplicate delivery");
  assert.deepEqual((received[0] as { topics: string[] }).topics, [
    "balances",
    "invoices:p1",
  ]);
  assert.equal(
    bob.some((envelope) => (envelope as { type: string }).type === "data.invalidate"),
    true,
  );
  assert.equal(
    carol.some((envelope) => (envelope as { type: string }).type === "data.invalidate"),
    false,
    "a member with no share in the expense is not told to refetch",
  );

  for (const stop of stops) stop();
});

test("RealtimeHub presence join/leave is connection-counted", async () => {
  const hub = new RealtimeHub();
  const events: string[] = [];
  hub.subscribePresence("w1", (e) => {
    if (e.type === "presence.join" || e.type === "presence.leave") {
      events.push(`${e.type}:${e.userId}`);
    }
  });
  const a = hub.subscribe("w1", "u1", () => undefined);
  const b = hub.subscribe("w1", "u1", () => undefined);
  assert.deepEqual(await hub.listPresentUserIds("w1"), ["u1"]);
  a();
  assert.deepEqual(await hub.listPresentUserIds("w1"), ["u1"]);
  b();
  assert.deepEqual(await hub.listPresentUserIds("w1"), []);
  assert.ok(events.includes("presence.join:u1"));
  assert.ok(events.includes("presence.leave:u1"));
});

test("RealtimeHub publishNotificationRead reaches subscriber", () => {
  const hub = new RealtimeHub();
  const got: unknown[] = [];
  hub.subscribe("w1", "u1", (e) => got.push(e));
  hub.publishNotificationRead(sample);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { type: "notification.read", notification: sample });
});

test("RealtimeHub does not cross-talk between users (single-process honesty)", () => {
  const hub = new RealtimeHub();
  const u1: unknown[] = [];
  const u2: unknown[] = [];
  hub.subscribe("w1", "u1", (e) => u1.push(e));
  hub.subscribe("w1", "u2", (e) => u2.push(e));
  hub.publishToUser("w1", "u1", { type: "heartbeat", at: "t0" });
  assert.equal(u1.length, 1);
  assert.equal(u2.length, 0);
});

test("RealtimeHub providerMode is sse_local until Redis fan-out starts", () => {
  const hub = new RealtimeHub();
  assert.equal(hub.providerMode(), "sse_local");
});
