import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { securityEventDefaults } from "@dang/contracts";
import { MemoryAccountStore } from "../auth/memory-account.store.js";
import { hashPassword } from "../auth/password.js";
import { MailerService } from "../auth/mailer.service.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { MemoryOutboxStore } from "../outbox/memory-outbox.store.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { MemoryPlatformBreakGlassStore } from "../platform/memory-platform.store.js";
import { PlatformService } from "../platform/platform.service.js";
import { MemorySecurityEventsStore } from "./memory-security-events.store.js";
import { SecurityEventsService } from "./security-events.service.js";

function buildPlatform(
  accounts: MemoryAccountStore,
  events: SecurityEventsService,
) {
  const outbox = new MemoryOutboxStore();
  return new PlatformService(
    accounts,
    new MemoryPlatformBreakGlassStore(),
    new MailerService(),
    events,
    outbox,
    new OutboxRelay(outbox),
  );
}

test("securityEventDefaults maps severity for auth failures", () => {
  assert.equal(securityEventDefaults("auth.login_failed").severity, "medium");
  assert.equal(securityEventDefaults("auth.rate_limited").severity, "high");
  assert.equal(securityEventDefaults("auth.password_changed").severity, "high");
  assert.equal(securityEventDefaults("auth.mfa_disabled").severity, "high");
  assert.equal(securityEventDefaults("access.maker_checker_denied").category, "access");
  assert.equal(securityEventDefaults("access.policy_denied").category, "access");
  assert.equal(securityEventDefaults("access.policy_denied").severity, "medium");
  assert.equal(securityEventDefaults("access.break_glass_opened").severity, "critical");
  assert.equal(securityEventDefaults("access.break_glass_revoked").severity, "high");
  assert.equal(securityEventDefaults("fraud.invite_anomaly").category, "fraud");
  assert.equal(securityEventDefaults("fraud.invite_anomaly").severity, "high");
});

test("emit persists into store; list filters by category/severity (R10-15)", async () => {
  const store = new MemorySecurityEventsStore();
  const svc = new SecurityEventsService(store);
  const auth = svc.emit("auth.login_failed", { reason: "invalid_credentials" });
  assert.ok(auth.id);
  // Memory append runs synchronously until first await — drain microtasks.
  await Promise.resolve();

  const listed = await svc.listRecent({ limit: 10 });
  assert.ok(listed.items.some((e) => e.event === "auth.login_failed"));

  svc.emit("access.policy_denied", {
    reason: "DENY_ROLE",
    attrs: { action: "expense.approve" },
  });
  await Promise.resolve();

  const accessOnly = await svc.listRecent({ category: "access", limit: 20 });
  assert.ok(accessOnly.items.every((e) => e.category === "access"));
  assert.ok(accessOnly.items.some((e) => e.event === "access.policy_denied"));

  svc.emit("auth.rate_limited", { reason: "burst" });
  await Promise.resolve();
  const highOnly = await svc.listRecent({ severity: "high", limit: 20 });
  assert.ok(highOnly.items.length >= 1);
  assert.ok(highOnly.items.every((e) => e.severity === "high"));
});

test("memory store filters by workspaceId when provided", async () => {
  const store = new MemorySecurityEventsStore();
  const svc = new SecurityEventsService(store);
  const wsA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const wsB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  svc.emit("fraud.settlement_anomaly", { workspaceId: wsA, reason: "a" });
  svc.emit("fraud.invite_anomaly", { workspaceId: wsB, reason: "b" });
  svc.emit("auth.login_failed", { reason: "global" });
  await Promise.resolve();

  const page = await svc.listRecent({ workspaceId: wsA, limit: 50 });
  assert.ok(page.items.length >= 1);
  assert.ok(page.items.every((e) => e.workspaceId === wsA));
  assert.ok(page.items.some((e) => e.event === "fraud.settlement_anomaly"));
  assert.ok(!page.items.some((e) => e.workspaceId === wsB));
});

test("platform listSecurityEvents 404 for non-platform actor", async () => {
  const accounts = new MemoryAccountStore();
  const row = await accounts.createLocalUser({
    email: "u@example.com",
    displayName: "regular",
    passwordHash: await hashPassword("StrongPass1!"),
    username: "regular",
  });
  const store = new MemorySecurityEventsStore();
  const events = new SecurityEventsService(store);
  const platform = buildPlatform(accounts, events);
  await assert.rejects(
    () =>
      platform.listSecurityEvents(
        {
          userId: row.userId,
          externalSubject: row.externalSubject,
          displayName: row.displayName,
          authMode: "password",
        },
        {},
      ),
    (err: unknown) => err instanceof NotFoundException,
  );
});

test("platform owner can list filtered security events", async () => {
  const accounts = new MemoryAccountStore();
  const owner = await accounts.createLocalUser({
    email: "owner@example.com",
    displayName: "owner",
    passwordHash: await hashPassword("StrongPass1!"),
    username: "owner1",
  });
  await accounts.setPlatformRole(owner.userId, "platform_owner");
  const store = new MemorySecurityEventsStore();
  const events = new SecurityEventsService(store);
  events.emit("auth.rate_limited", { reason: "burst" });
  events.emit("fraud.settlement_anomaly", { reason: "amount" });
  await Promise.resolve();

  const platform = buildPlatform(accounts, events);
  const page = await platform.listSecurityEvents(
    {
      userId: owner.userId,
      externalSubject: owner.externalSubject,
      displayName: owner.displayName,
      authMode: "password",
    },
    { category: "fraud" },
  );
  assert.ok(page.items.every((e) => e.category === "fraud"));
  assert.equal(page.items[0]?.event, "fraud.settlement_anomaly");
});

test("W1 workspace security-events: guest denied; owner scoped + category filter", async () => {
  const iam = new MemoryIamStore();
  const owner = await iam.upsertDevActor({
    externalSubject: `owner-${crypto.randomUUID()}@test`,
    displayName: "Owner",
  });
  const guest = await iam.upsertDevActor({
    externalSubject: `guest-${crypto.randomUUID()}@test`,
    displayName: "Guest",
  });
  const finance = await iam.upsertDevActor({
    externalSubject: `finance-${crypto.randomUUID()}@test`,
    displayName: "Finance",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Sec WS",
    slug: `sec-${crypto.randomUUID().slice(0, 8)}`,
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
    userId: guest.userId,
    role: "guest",
    addedVia: "user_id",
  });
  const other = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Other",
    slug: `other-${crypto.randomUUID().slice(0, 8)}`,
    template: "small_team",
  });

  const store = new MemorySecurityEventsStore();
  const access = new WorkspaceAccessService(iam);
  const svc = new SecurityEventsService(store, access);

  svc.emit("fraud.settlement_anomaly", {
    workspaceId: workspace.id,
    reason: "local",
  });
  svc.emit("access.policy_denied", {
    workspaceId: workspace.id,
    reason: "deny",
  });
  svc.emit("fraud.invite_anomaly", {
    workspaceId: other.id,
    reason: "other-ws",
  });
  await Promise.resolve();

  const guestActor = {
    userId: guest.userId,
    externalSubject: guest.externalSubject,
    displayName: guest.displayName,
    authMode: "dev" as const,
  };
  const ownerActor = {
    userId: owner.userId,
    externalSubject: owner.externalSubject,
    displayName: owner.displayName,
    authMode: "dev" as const,
  };

  await assert.rejects(
    () => svc.listForWorkspace(guestActor, workspace.id, {}),
    (err: unknown) => err instanceof ForbiddenException,
  );

  const ownerPage = await svc.listForWorkspace(ownerActor, workspace.id, {});
  assert.ok(ownerPage.items.length >= 2);
  assert.ok(ownerPage.items.every((e) => e.workspaceId === workspace.id));
  assert.ok(!ownerPage.items.some((e) => e.workspaceId === other.id));

  const fraudOnly = await svc.listForWorkspace(ownerActor, workspace.id, {
    category: "fraud",
  });
  assert.ok(fraudOnly.items.length >= 1);
  assert.ok(fraudOnly.items.every((e) => e.category === "fraud"));
  assert.ok(fraudOnly.items.every((e) => e.workspaceId === workspace.id));
  assert.ok(fraudOnly.items.some((e) => e.event === "fraud.settlement_anomaly"));
});
