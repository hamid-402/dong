/**
 * R10-03 — memory outbox insert + relay marks processed.
 * W6 — listPendingForRedrive for platform sweep.
 * Law 10 — retry / dead-letter after MAX_ATTEMPTS failures.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { verifyWebhookSignature } from "@dang/contracts";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryWorkspaceWebhookStore } from "../webhooks/memory-webhook.store.js";
import { WebhooksService } from "../webhooks/webhooks.service.js";
import { MemoryOutboxStore } from "./memory-outbox.store.js";
import { OutboxRelay, MAX_ATTEMPTS } from "./outbox.relay.js";
import { OUTBOX_BASE_BACKOFF_MS } from "./outbox.retry.js";

test("memory outbox insert and markProcessed", async () => {
  const store = new MemoryOutboxStore();
  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "expense",
    aggregateId: "00000000-0000-4000-8000-000000000001",
    eventType: "expense.posted",
    payload: { expenseId: "e1", title: "t", paidByUserId: "u1", participantUserIds: [] },
  });
  assert.equal(row.attempts, 0);
  const pending = await store.listPending();
  assert.equal(pending.length, 1);
  await store.markProcessed(row.id, "w1");
  assert.equal((await store.listPending()).length, 0);
});

test("W6 memory listPendingForRedrive returns unprocessed only", async () => {
  const store = new MemoryOutboxStore();
  const a = await store.insert({
    workspaceId: "w1",
    aggregateType: "expense",
    aggregateId: "00000000-0000-4000-8000-000000000001",
    eventType: "expense.posted",
    payload: { expenseId: "e1", title: "t", paidByUserId: "u1", participantUserIds: [] },
  });
  await store.insert({
    workspaceId: "w2",
    aggregateType: "settlement",
    aggregateId: "00000000-0000-4000-8000-000000000002",
    eventType: "settlement.confirmed",
    payload: {
      actorUserId: "u1",
      fromUserId: "u1",
      toUserId: "u2",
      amountMinor: 100,
    },
  });
  await store.markProcessed(a.id, "w1");
  const pending = await store.listPendingForRedrive(10);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.workspaceId, "w2");
});

test("a confirmed settlement invalidates both sides' balances", async () => {
  const store = new MemoryOutboxStore();
  const invalidations: Array<{ userIds: string[]; topics: string[] }> = [];
  const realtime = {
    publishInvalidate: (
      _workspaceId: string,
      userIds: string[],
      topics: string[],
    ) => {
      invalidations.push({ userIds, topics });
    },
  };
  const notifications = { notifySettlementConfirmed: async () => undefined };
  const relay = new OutboxRelay(store, notifications as never, realtime as never);

  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "settlement",
    aggregateId: "00000000-0000-4000-8000-000000000002",
    eventType: "settlement.confirmed",
    payload: {
      actorUserId: "u1",
      fromUserId: "u1",
      toUserId: "u2",
      amountMinor: 100,
    },
  });
  await relay.dispatch(row);
  assert.ok(invalidations.some((i) => i.userIds.includes("u1") && i.userIds.includes("u2")));
  assert.equal((await store.listPending()).length, 0);
});

test("G15 outbox fan-out calls webhooks and still processes on webhook reject", async () => {
  const store = new MemoryOutboxStore();
  const calls: Array<{ workspaceId: string; eventType: string }> = [];
  const webhooks = {
    dispatchEvent: async (workspaceId: string, eventType: string) => {
      calls.push({ workspaceId, eventType });
      throw new Error("webhook boom");
    },
  };
  const notifications = {
    notifyExpensePosted: async () => undefined,
  };
  const relay = new OutboxRelay(
    store,
    notifications as never,
    undefined,
    webhooks as never,
  );

  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "expense",
    aggregateId: "00000000-0000-4000-8000-000000000001",
    eventType: "expense.posted",
    payload: {
      expenseId: "e1",
      title: "t",
      paidByUserId: "u1",
      participantUserIds: ["u1"],
    },
  });
  await relay.dispatch(row);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.eventType, "expense.posted");
  assert.equal((await store.listPending()).length, 0);
});

test("G15 depth: OutboxRelay + real WebhooksService HMAC delivery", async () => {
  const outbox = new MemoryOutboxStore();
  const iam = new MemoryIamStore();
  const owner = await iam.upsertDevActor({
    externalSubject: `owner-${crypto.randomUUID()}@test`,
    displayName: "Owner",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Relay",
    slug: `relay-${crypto.randomUUID().slice(0, 8)}`,
    template: "small_team",
  });
  const hookStore = new MemoryWorkspaceWebhookStore();
  const webhooks = new WebhooksService(hookStore, iam);
  await webhooks.create(
    {
      userId: owner.userId,
      externalSubject: owner.externalSubject,
      displayName: owner.displayName,
      authMode: "dev",
    },
    workspace.id,
    {
      workspaceId: workspace.id,
      url: "https://example.com/relay-hook",
      events: ["expense.posted"],
      secret: "secret-sixteen-xx",
      idempotencyKey: "relay-1",
    },
  );

  let sawSig = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const sig = headers["x-dang-signature"] ?? "";
    sawSig = verifyWebhookSignature({
      secret: "secret-sixteen-xx",
      timestamp: headers["x-dang-timestamp"]!,
      body,
      signature: sig.slice("sha256=".length),
    });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    const notifications = { notifyExpensePosted: async () => undefined };
    const relay = new OutboxRelay(
      outbox,
      notifications as never,
      undefined,
      webhooks,
    );
    const row = await outbox.insert({
      workspaceId: workspace.id,
      aggregateType: "expense",
      aggregateId: "00000000-0000-4000-8000-000000000099",
      eventType: "expense.posted",
      payload: {
        expenseId: "e99",
        title: "t",
        paidByUserId: owner.userId,
        participantUserIds: [owner.userId],
      },
    });
    await relay.dispatch(row);
    assert.equal(sawSig, true);
    assert.equal((await outbox.listPending()).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a correction notice on a locked invoice reaches the member", async () => {
  const store = new MemoryOutboxStore();
  const invalidations: Array<{ userIds: string[]; topics: string[] }> = [];
  const notified: Array<{ actor: string; member: string; delta: string }> = [];
  const realtime = {
    publishInvalidate: (_w: string, userIds: string[], topics: string[]) => {
      invalidations.push({ userIds, topics });
    },
  };
  const notifications = {
    notifyInvoiceAdjusted: async (
      _workspaceId: string,
      actorUserId: string,
      memberUserId: string,
      deltaMinor: string,
    ) => {
      notified.push({ actor: actorUserId, member: memberUserId, delta: deltaMinor });
    },
  };
  const relay = new OutboxRelay(store, notifications as never, realtime as never);

  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "member_invoice",
    aggregateId: "00000000-0000-4000-8000-000000000003",
    eventType: "invoice.recalculated",
    payload: {
      periodId: "p1",
      memberUserIds: ["u1", "u2"],
      reason: "billing.invoice.reconcile",
      actorUserId: "finance",
      adjustments: [{ memberUserId: "u2", deltaMinor: "-1500" }],
    },
  });
  await relay.dispatch(row);

  assert.deepEqual(invalidations[0]?.topics, ["balances", "statements", "invoices:p1"]);
  assert.deepEqual(notified, [{ actor: "finance", member: "u2", delta: "-1500" }]);
  assert.ok(store.get(row.id)?.processedAt);
});

test("a redrawn draft invoice notifies nobody", async () => {
  const store = new MemoryOutboxStore();
  let notifyCalls = 0;
  const relay = new OutboxRelay(
    store,
    {
      notifyInvoiceAdjusted: async () => {
        notifyCalls += 1;
      },
    } as never,
    { publishInvalidate: () => undefined } as never,
  );

  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "member_invoice",
    aggregateId: "00000000-0000-4000-8000-000000000004",
    eventType: "invoice.recalculated",
    payload: { periodId: "p1", memberUserIds: ["u1"], reason: "expense.posted" },
  });
  await relay.dispatch(row);

  assert.equal(notifyCalls, 0, "a live redraw is not news");
  assert.ok(store.get(row.id)?.processedAt);
});

test("Law 10: apply failing MAX_ATTEMPTS times dead-letters the row", async () => {
  const store = new MemoryOutboxStore();
  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "expense",
    aggregateId: "00000000-0000-4000-8000-000000000001",
    eventType: "expense.posted",
    payload: {
      expenseId: "e1",
      title: "t",
      paidByUserId: "u1",
      participantUserIds: ["u2"],
    },
  });

  const failingNotify = {
    notifyExpensePosted: async () => {
      throw new Error("apply mock fail");
    },
  };
  const relay = new OutboxRelay(store, failingNotify as never);

  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    await assert.rejects(() => relay.dispatch(row), /apply mock fail/);
  }

  const dead = store.get(row.id);
  assert.ok(dead?.deadLetteredAt, "expected dead_lettered_at after MAX_ATTEMPTS");
  assert.equal(dead?.attempts, MAX_ATTEMPTS);
  assert.equal(dead?.nextAttemptAt, undefined);
  assert.match(dead?.lastError ?? "", /apply mock fail/);

  assert.equal((await store.listPending()).length, 0);
  assert.equal((await store.listPendingForRedrive()).length, 0);
  assert.equal((await relay.redrive(10)).attempted, 0);
});

test("Law 10: listPending skips not-yet-due backoff rows", async () => {
  const store = new MemoryOutboxStore();
  const row = await store.insert({
    workspaceId: "w1",
    aggregateType: "expense",
    aggregateId: "00000000-0000-4000-8000-000000000001",
    eventType: "expense.posted",
    payload: { expenseId: "e1", title: "t", paidByUserId: "u1", participantUserIds: [] },
  });
  await store.markFailed(row.id, "w1", "transient");
  const after = store.get(row.id);
  assert.equal(after?.attempts, 1);
  assert.ok(after?.nextAttemptAt);
  const dueAt = Date.parse(after!.nextAttemptAt!);
  assert.ok(dueAt >= Date.now() + OUTBOX_BASE_BACKOFF_MS - 50);
  assert.equal((await store.listPending()).length, 0);
});
