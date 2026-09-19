import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { MemoryAccountStore } from "../auth/memory-account.store.js";
import { hashPassword } from "../auth/password.js";
import { MailerService } from "../auth/mailer.service.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { MemoryPlatformBreakGlassStore } from "./memory-platform.store.js";
import { PlatformService } from "./platform.service.js";

async function seedUser(
  accounts: MemoryAccountStore,
  email: string,
  username: string,
  role: "user" | "platform_support" | "platform_owner" = "user",
) {
  const row = await accounts.createLocalUser({
    email,
    displayName: username,
    passwordHash: await hashPassword("StrongPass1!"),
    username,
  });
  if (role !== "user") {
    await accounts.setPlatformRole(row.userId, role);
  }
  return (await accounts.findById(row.userId))!;
}

function actorOf(row: { userId: string; externalSubject: string; displayName: string }) {
  return {
    userId: row.userId,
    externalSubject: row.externalSubject,
    displayName: row.displayName,
    authMode: "password" as const,
  };
}

function buildService(accounts: MemoryAccountStore) {
  const outbox = new MemoryOutboxStore();
  return new PlatformService(
    accounts,
    new MemoryPlatformBreakGlassStore(),
    new MailerService(),
    new SecurityEventsService(),
    outbox,
    new OutboxRelay(outbox),
  );
}

test("S11-13 non-owner gets 404 on platform users", async () => {
  const accounts = new MemoryAccountStore();
  const user = await seedUser(accounts, "u@example.com", "regular");
  const service = buildService(accounts);
  await assert.rejects(
    () => service.listUsers(actorOf(user), {}),
    (err: unknown) => err instanceof NotFoundException,
  );
});

test("S11-13 platform_owner can list users", async () => {
  const accounts = new MemoryAccountStore();
  const owner = await seedUser(accounts, "owner@example.com", "owner1", "platform_owner");
  await seedUser(accounts, "a@example.com", "alice");
  const service = buildService(accounts);
  const page = await service.listUsers(actorOf(owner), { q: "ali" });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.username, "alice");
});

test("S11-13 break-glass open and revoke", async () => {
  const accounts = new MemoryAccountStore();
  const owner = await seedUser(accounts, "bg@example.com", "bgowner", "platform_owner");
  const service = buildService(accounts);
  const workspaceId = crypto.randomUUID();
  const opened = await service.openBreakGlass(actorOf(owner), {
    workspaceId,
    reason: "incident ticket review",
    expiresInMinutes: 30,
  });
  assert.equal(opened.active, true);
  assert.equal(opened.workspaceId, workspaceId);
  assert.ok(await service.hasActiveBreakGlass(owner.userId, workspaceId));

  const revoked = await service.revokeBreakGlass(actorOf(owner), opened.id);
  assert.ok(revoked.revokedAt);
  assert.equal(revoked.active, false);
  assert.equal(await service.hasActiveBreakGlass(owner.userId, workspaceId), false);
});

test("S11-13 support can read flags but not list users", async () => {
  const accounts = new MemoryAccountStore();
  const support = await seedUser(
    accounts,
    "sup@example.com",
    "support1",
    "platform_support",
  );
  const service = buildService(accounts);
  const flags = await service.getFlags(actorOf(support));
  assert.ok(flags.productFlags);
  assert.equal(flags.envKeys.makerChecker, "ENABLE_MAKER_CHECKER");
  await assert.rejects(
    () => service.listUsers(actorOf(support), {}),
    (err: unknown) => err instanceof NotFoundException,
  );
});

test("S11-13 setUserRole applies and maker-checker stages owner elevation", async () => {
  const prev = process.env.ENABLE_MAKER_CHECKER;
  process.env.ENABLE_MAKER_CHECKER = "true";
  try {
    const accounts = new MemoryAccountStore();
    const ownerA = await seedUser(accounts, "oa@example.com", "ownera", "platform_owner");
    const ownerB = await seedUser(accounts, "ob@example.com", "ownerb", "platform_owner");
    const target = await seedUser(accounts, "t@example.com", "targetu", "user");
    const service = buildService(accounts);

    const support = await service.setUserRole(actorOf(ownerA), target.userId, {
      platformRole: "platform_support",
    });
    assert.equal(support.status, "applied");
    assert.equal(support.user.platformRole, "platform_support");

    const staged = await service.setUserRole(actorOf(ownerA), target.userId, {
      platformRole: "platform_owner",
    });
    assert.equal(staged.status, "pending_second_owner");
    assert.ok(staged.pendingId);
    assert.equal(staged.user.platformRole, "platform_support");

    await assert.rejects(
      () =>
        service.setUserRole(actorOf(ownerA), target.userId, {
          platformRole: "platform_owner",
          confirmPendingId: staged.pendingId,
        }),
      (err: unknown) => {
        const body = (err as { getResponse: () => { code?: string } }).getResponse();
        assert.equal(body.code, "PENDING_ROLE_INVALID");
        return true;
      },
    );

    const confirmed = await service.setUserRole(actorOf(ownerB), target.userId, {
      platformRole: "platform_owner",
      confirmPendingId: staged.pendingId,
    });
    assert.equal(confirmed.status, "applied");
    assert.equal(confirmed.user.platformRole, "platform_owner");
  } finally {
    if (prev === undefined) delete process.env.ENABLE_MAKER_CHECKER;
    else process.env.ENABLE_MAKER_CHECKER = prev;
  }
});

test("W1 platform outbox stats 404 for non-platform; owner sees real gauges", async () => {
  const accounts = new MemoryAccountStore();
  const user = await seedUser(accounts, "u2@example.com", "regular2");
  const owner = await seedUser(accounts, "owner2@example.com", "owner2", "platform_owner");
  const service = buildService(accounts);

  await assert.rejects(
    () => service.getOutboxStats(actorOf(user)),
    (err: unknown) => err instanceof NotFoundException,
  );

  const page = await service.getOutboxStats(actorOf(owner));
  assert.equal(page.persistence, "memory");
  assert.ok(page.stats);
  assert.equal(typeof page.stats.pendingCount, "number");
  assert.equal(typeof page.stats.failedPendingCount, "number");
});

test("W6 platform outbox redrive returns real counts for owner", async () => {
  const accounts = new MemoryAccountStore();
  const user = await seedUser(accounts, "u3@example.com", "regular3");
  const owner = await seedUser(accounts, "owner3@example.com", "owner3", "platform_owner");
  const outbox = new MemoryOutboxStore();
  const service = new PlatformService(
    accounts,
    new MemoryPlatformBreakGlassStore(),
    new MailerService(),
    new SecurityEventsService(),
    outbox,
    new OutboxRelay(outbox),
  );

  await assert.rejects(
    () => service.redriveOutbox(actorOf(user), 10),
    (err: unknown) => err instanceof NotFoundException,
  );

  await outbox.insert({
    workspaceId: "w1",
    aggregateType: "expense",
    aggregateId: "00000000-0000-4000-8000-000000000099",
    eventType: "expense.reversed",
    payload: {},
  });

  const result = await service.redriveOutbox(actorOf(owner), 10);
  assert.equal(result.persistence, "memory");
  assert.equal(result.attempted, 1);
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal((await outbox.listPending()).length, 0);
});
