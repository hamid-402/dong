import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { WorkspacesService } from "./workspaces.service.js";

test("owner can persist workspace profile changes and receives an audit event", async () => {
  const iam = new MemoryIamStore();
  const audit = new MemoryAuditStore();
  const service = new WorkspacesService(iam, audit);
  const actor = await iam.upsertDevActor({
    externalSubject: "workspace-owner",
    displayName: "Workspace Owner",
  });
  const workspace = await service.create(actor, {
    name: "فضای اولیه",
    slug: "workspace-profile-test",
    template: "small_team",
  });

  const updated = await service.updateProfile(actor, workspace.id, {
    name: "اتاق عملیات مرکزی",
    timezone: "UTC",
    displayUnit: "rial",
  });

  assert.equal(updated.name, "اتاق عملیات مرکزی");
  assert.equal(updated.timezone, "UTC");
  assert.equal(updated.displayUnit, "rial");
  assert.deepEqual(await service.getForActor(actor, workspace.id), updated);
  const events = await audit.listForWorkspace(workspace.id, actor.userId);
  assert.equal(events?.at(-1)?.action, "workspace.profile.update");
  assert.equal(events?.at(-1)?.metadata?.nameChanged, true);
});

test("workspace update rejects invalid IANA timezone without mutating data", async () => {
  const iam = new MemoryIamStore();
  const service = new WorkspacesService(iam, new MemoryAuditStore());
  const actor = await iam.upsertDevActor({
    externalSubject: "timezone-owner",
    displayName: "Timezone Owner",
  });
  const workspace = await service.create(actor, {
    name: "فضای زمان",
    slug: "timezone-profile-test",
    template: "project_partners",
  });

  await assert.rejects(
    service.updateProfile(actor, workspace.id, {
      name: "فضای زمان",
      timezone: "Mars/Olympus",
      displayUnit: "toman",
    }),
    BadRequestException,
  );
  assert.equal((await service.getForActor(actor, workspace.id)).timezone, "Asia/Tehran");
});

test("member can leave workspace; owner cannot without transfer", async () => {
  const iam = new MemoryIamStore();
  const audit = new MemoryAuditStore();
  const service = new WorkspacesService(iam, audit);
  const owner = await iam.upsertDevActor({
    externalSubject: "leave-owner",
    displayName: "Owner",
  });
  const member = await iam.upsertDevActor({
    externalSubject: "leave-member",
    displayName: "Member",
  });
  const workspace = await service.create(owner, {
    name: "گروه ترک",
    slug: "leave-lifecycle-test",
    template: "small_team",
  });
  await iam.addMemberByUserId({
    workspaceId: workspace.id,
    actorUserId: owner.userId,
    userId: member.userId,
    role: "finance",
    addedVia: "user_id",
  });

  await assert.rejects(service.leave(owner, workspace.id, {}), ConflictException);

  const left = await service.leave(member, workspace.id, { reason: "bye" });
  assert.ok(left.disabledAt);
  assert.equal(left.disabledReason, "bye");
  const listed = await service.listForActor(member);
  assert.equal(listed.some((w) => w.id === workspace.id), false);
  const events = await audit.listForWorkspace(workspace.id, owner.userId);
  assert.ok(events?.some((e) => e.action === "workspace.membership.leave"));
});

test("owner can archive then soft-delete; personal is protected", async () => {
  const iam = new MemoryIamStore();
  const audit = new MemoryAuditStore();
  const service = new WorkspacesService(iam, audit);
  const owner = await iam.upsertDevActor({
    externalSubject: "archive-owner",
    displayName: "Archive Owner",
  });
  const workspace = await service.create(owner, {
    name: "پروژه بایگانی",
    slug: "archive-lifecycle-test",
    template: "small_team",
  });

  const archived = await service.archive(owner, workspace.id);
  assert.ok(archived.archivedAt);
  assert.ok(
    (await service.listForActor(owner)).some((w) => w.id === workspace.id && w.archivedAt),
  );

  await assert.rejects(
    service.updateProfile(owner, workspace.id, {
      name: "پروژه بایگانی",
      timezone: "UTC",
      displayUnit: "rial",
    }),
    ConflictException,
  );

  const restored = await service.unarchive(owner, workspace.id);
  assert.equal(restored.archivedAt, undefined);

  await service.archive(owner, workspace.id);
  await assert.rejects(
    service.softDelete(owner, workspace.id, { confirmSlug: "wrong-slug" }),
    BadRequestException,
  );
  const deleted = await service.softDelete(owner, workspace.id, {
    confirmSlug: "archive-lifecycle-test",
  });
  assert.ok(deleted.deletedAt);
  assert.equal(
    (await service.listForActor(owner)).some((w) => w.id === workspace.id),
    false,
  );

  const personal = await iam.ensurePersonalWorkspace(owner.userId);
  await assert.rejects(service.archive(owner, personal.id), ForbiddenException);
  await assert.rejects(service.leave(owner, personal.id, {}), ForbiddenException);
});
