import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
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
