import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { verifyWebhookSignature, type AuthActor } from "@dang/contracts";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryWorkspaceWebhookStore } from "./memory-webhook.store.js";
import { WebhooksService } from "./webhooks.service.js";

const secret = "secret-sixteen-xx";

async function seed() {
  const iam = new MemoryIamStore();
  const owner = await iam.upsertDevActor({
    externalSubject: `owner-${crypto.randomUUID()}@test`,
    displayName: "Owner",
  });
  const outsider = await iam.upsertDevActor({
    externalSubject: `out-${crypto.randomUUID()}@test`,
    displayName: "Outsider",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Hooks",
    slug: `hooks-${crypto.randomUUID().slice(0, 8)}`,
    template: "small_team",
  });
  return {
    iam,
    owner: {
      userId: owner.userId,
      externalSubject: owner.externalSubject,
      displayName: owner.displayName,
      authMode: "dev" as const,
    } satisfies AuthActor,
    outsider: {
      userId: outsider.userId,
      externalSubject: outsider.externalSubject,
      displayName: outsider.displayName,
      authMode: "dev" as const,
    } satisfies AuthActor,
    workspace,
  };
}

test("G15 WebhooksService create/list/deactivate + validation", async () => {
  const { iam, owner, outsider, workspace } = await seed();
  const store = new MemoryWorkspaceWebhookStore();
  const service = new WebhooksService(store, iam);

  await assert.rejects(
    () =>
      service.create(outsider, workspace.id, {
        workspaceId: workspace.id,
        url: "https://example.com/h",
        events: ["expense.posted"],
        secret: "secret-sixteen-xx",
        idempotencyKey: "idem-out",
      }),
    (err: unknown) => err instanceof ForbiddenException,
  );

  await assert.rejects(
    () =>
      service.create(owner, workspace.id, {
        workspaceId: workspace.id,
        url: "http://evil.example/h",
        events: ["expense.posted"],
        secret: "secret-sixteen-xx",
        idempotencyKey: "idem-http",
      }),
    (err: unknown) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      service.create(owner, workspace.id, {
        workspaceId: workspace.id,
        url: "https://example.com/h",
        events: ["expense.posted"],
        secret: "short",
        idempotencyKey: "idem-short",
      }),
    (err: unknown) => err instanceof BadRequestException,
  );

  const created = await service.create(owner, workspace.id, {
    workspaceId: workspace.id,
    url: "https://example.com/hook",
    events: ["expense.posted"],
    secret: "secret-sixteen-xx",
    idempotencyKey: "idem-ok",
  });
  assert.equal(created.active, true);
  assert.equal(created.hasSecret, true);

  const again = await service.create(owner, workspace.id, {
    workspaceId: workspace.id,
    url: "https://example.com/hook",
    events: ["expense.posted"],
    secret: "secret-sixteen-xx",
    idempotencyKey: "idem-ok",
  });
  assert.equal(again.id, created.id);

  const listed = await service.list(owner, workspace.id);
  assert.equal(listed.length, 1);

  const off = await service.deactivate(owner, workspace.id, created.id);
  assert.equal(off.active, false);
});

test("G15 WebhooksService.dispatchEvent signs and reports delivery", async () => {
  const { iam, owner, workspace } = await seed();
  const store = new MemoryWorkspaceWebhookStore();
  const service = new WebhooksService(store, iam);
  const secret = "secret-sixteen-xx";

  await service.create(owner, workspace.id, {
    workspaceId: workspace.id,
    url: "https://example.com/hook-a",
    events: ["expense.posted"],
    secret,
    idempotencyKey: "d1",
  });
  await service.create(owner, workspace.id, {
    workspaceId: workspace.id,
    url: "https://example.com/hook-b",
    events: ["expense.posted", "settlement.confirmed"],
    secret,
    idempotencyKey: "d2",
  });
  await service.create(owner, workspace.id, {
    workspaceId: workspace.id,
    url: "https://example.com/hook-skip",
    events: ["settlement.confirmed"],
    secret,
    idempotencyKey: "d3",
  });

  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    body: string;
  }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, headers, body });
    if (url.includes("hook-b")) {
      return new Response("fail", { status: 500 });
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    const results = await service.dispatchEvent(workspace.id, "expense.posted", {
      expenseId: "e1",
    });
    assert.equal(results.length, 2);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.filter((r) => !r.ok).length, 1);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.headers["x-dang-event"], "expense.posted");
      assert.ok(call.headers["x-dang-timestamp"]);
      const sig = call.headers["x-dang-signature"] ?? "";
      assert.match(sig, /^sha256=/);
      assert.equal(
        verifyWebhookSignature({
          secret,
          timestamp: call.headers["x-dang-timestamp"]!,
          body: call.body,
          signature: sig.slice("sha256=".length),
        }),
        true,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("G15 WebhooksService.create forbidden for plain member", async () => {
  const iam = new MemoryIamStore();
  const owner = await iam.upsertDevActor({
    externalSubject: `owner-${crypto.randomUUID()}@test`,
    displayName: "Owner",
  });
  const finance = await iam.upsertDevActor({
    externalSubject: `fin-${crypto.randomUUID()}@test`,
    displayName: "Finance",
  });
  const member = await iam.upsertDevActor({
    externalSubject: `mem-${crypto.randomUUID()}@test`,
    displayName: "Member",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Hooks",
    slug: `hooks-${crypto.randomUUID().slice(0, 8)}`,
    template: "small_team",
  });
  await iam.addMemberByUserId({
    workspaceId: workspace.id,
    actorUserId: owner.userId,
    userId: finance.userId,
    role: "finance",
    addedVia: "user_id",
  });
  await iam.addMemberByUserId({
    workspaceId: workspace.id,
    actorUserId: owner.userId,
    userId: member.userId,
    role: "member",
    addedVia: "user_id",
  });
  const service = new WebhooksService(new MemoryWorkspaceWebhookStore(), iam);
  await assert.rejects(
    () =>
      service.create(
        {
          userId: member.userId,
          externalSubject: member.externalSubject,
          displayName: member.displayName,
          authMode: "dev",
        },
        workspace.id,
        {
          workspaceId: workspace.id,
          url: "https://example.com/h",
          events: ["expense.posted"],
          secret: "secret-sixteen-xx",
          idempotencyKey: "mem-forbid",
        },
      ),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test("G15 WebhooksService.dispatchEvent network error returns ok:false", async () => {
  const { iam, owner, workspace } = await seed();
  const store = new MemoryWorkspaceWebhookStore();
  const service = new WebhooksService(store, iam);
  await service.create(owner, workspace.id, {
    workspaceId: workspace.id,
    url: "https://example.com/down",
    events: ["expense.posted"],
    secret: "secret-sixteen-xx",
    idempotencyKey: "net-1",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  try {
    const results = await service.dispatchEvent(workspace.id, "expense.posted", {
      expenseId: "e2",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ok, false);
    assert.match(results[0]?.detail ?? "", /ECONNREFUSED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
