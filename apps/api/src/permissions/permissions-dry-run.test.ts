import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPermissionsStore } from "./memory-permissions.store.js";
import { PermissionsService } from "./permissions.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  externalSubject: "owner@test",
  displayName: "Owner",
  authMode: "dev" as const,
};

test("permissions dry-run allows member expense.create", async () => {
  const iam = new MemoryIamStore();
  const ws = await iam.createWorkspace({
    actorUserId: actor.userId,
    name: "Dry run",
    slug: "dry-run-ws",
    template: "friends_family",
  });
  const financeId = "33333333-3333-4333-8333-333333333333";
  const memberId = "22222222-2222-4222-8222-222222222222";
  await iam.upsertDevActor({
    userId: financeId,
    externalSubject: "finance@test",
    displayName: "Finance",
  });
  await iam.addMemberByUserId({
    workspaceId: ws.id,
    userId: financeId,
    role: "finance",
    actorUserId: actor.userId,
    addedVia: "admin_add",
  });
  await iam.upsertDevActor({
    userId: memberId,
    externalSubject: "member@test",
    displayName: "Member",
  });
  await iam.addMemberByUserId({
    workspaceId: ws.id,
    userId: memberId,
    role: "member",
    actorUserId: actor.userId,
    addedVia: "admin_add",
  });

  const permissions = new MemoryPermissionsStore();
  const access = new WorkspaceAccessService(iam, undefined, permissions);
  const svc = new PermissionsService(permissions, access);

  const result = await svc.dryRun(ws.id, actor, {
    userId: memberId,
    action: "expense.create",
  });
  assert.equal(result.allowed, true);
});
