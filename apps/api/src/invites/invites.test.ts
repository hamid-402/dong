import assert from "node:assert/strict";
import test from "node:test";
import { GoneException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";
import { MailerService } from "../auth/mailer.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { InvitesService } from "./invites.service.js";

test("invites create returns token for assignable role and lists for admin", async () => {
  const iam = new MemoryIamStore();
  const audit = new MemoryAuditStore();
  const mailer = new MailerService();
  const access = {
    requireAccess: async () => ({
      role: "owner",
      decision: { allowed: true },
    }),
  } as unknown as WorkspaceAccessService;
  const securityEvents = { emit: () => ({}) as never } as never;
  const notifications = {
    notifySecurityAlert: async () => undefined,
  } as never;

  const service = new InvitesService(
    iam,
    audit,
    mailer,
    access,
    securityEvents,
    notifications,
  );

  const ws = await iam.createWorkspace({
    actorUserId: "owner-1",
    name: "Invite WS",
    slug: "invite-ws",
    template: "friends_family",
  });

  const actor: AuthActor = {
    userId: "owner-1",
    displayName: "Owner",
    externalSubject: "local:owner-1",
    authMode: "password",
  };

  const created = await service.create(actor, ws.id, {
    role: "finance",
    invitedSubject: "friend@example.com",
    expiresInHours: 48,
  });
  assert.ok(created.id);
  assert.ok(created.token.length > 8);
  assert.equal(created.role, "finance");

  const listed = await service.list(actor, ws.id);
  assert.ok(listed.some((i) => i.id === created.id));
});

test("invites refuse owner role invitation", async () => {
  const iam = new MemoryIamStore();
  const service = new InvitesService(
    iam,
    new MemoryAuditStore(),
    new MailerService(),
    {
      requireAccess: async () => ({
        role: "owner",
        decision: { allowed: true },
      }),
    } as unknown as WorkspaceAccessService,
    { emit: () => ({}) as never } as never,
    { notifySecurityAlert: async () => undefined } as never,
  );
  const ws = await iam.createWorkspace({
    actorUserId: "owner-1",
    name: "Invite WS2",
    slug: "invite-ws2",
    template: "friends_family",
  });
  const actor: AuthActor = {
    userId: "owner-1",
    displayName: "Owner",
    externalSubject: "local:owner-1",
    authMode: "password",
  };
  await assert.rejects(
    () =>
      service.create(actor, ws.id, {
        role: "owner",
        invitedSubject: "x@example.com",
      }),
    (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 400,
  );
});

test("accept rejects expired invite token", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-07T00:00:00.000Z") });
  try {
    const iam = new MemoryIamStore();
    const service = new InvitesService(
      iam,
      new MemoryAuditStore(),
      new MailerService(),
      {
        requireAccess: async () => ({
          role: "owner",
          decision: { allowed: true },
        }),
      } as unknown as WorkspaceAccessService,
      { emit: () => ({}) as never } as never,
      {
        notifySecurityAlert: async () => undefined,
        notifyInviteExpiringSoon: async () => undefined,
      } as never,
    );
    const ws = await iam.createWorkspace({
      actorUserId: "owner-1",
      name: "Expired",
      slug: "expired-inv",
      template: "friends_family",
    });
    await iam.upsertDevActor({
      userId: "finance-1",
      externalSubject: "local:finance-1",
      displayName: "Finance",
    });
    await iam.addMemberByUserId({
      workspaceId: ws.id,
      userId: "finance-1",
      role: "finance",
      actorUserId: "owner-1",
      addedVia: "admin_add",
    });
    const created = await service.create(
      {
        userId: "owner-1",
        displayName: "Owner",
        externalSubject: "local:owner-1",
        authMode: "password",
      },
      ws.id,
      {
        role: "admin",
        invitedSubject: "late@example.com",
        expiresInHours: 1,
      },
    );
    t.mock.timers.setTime(Date.parse("2026-09-08T02:00:00.000Z"));
    await assert.rejects(
      () =>
        service.accept(
          {
            userId: "guest-1",
            displayName: "Guest",
            externalSubject: "local:guest-1",
            authMode: "password",
          },
          created.token,
        ),
      (err: unknown) => err instanceof GoneException,
    );
  } finally {
    t.mock.timers.reset();
  }
});
