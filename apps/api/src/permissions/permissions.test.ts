import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { resolveGrantLayers } from "@dang/contracts";
import { MemoryPermissionsStore } from "./memory-permissions.store.js";
import { PermissionsService } from "./permissions.service.js";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  externalSubject: "owner@test",
  displayName: "Owner",
  authMode: "dev" as const,
};

test("permissions: locked actions cannot be granted", async () => {
  const store = new MemoryPermissionsStore();
  const svc = new PermissionsService(store, undefined);
  await assert.rejects(
    () =>
      svc.putRoleGrants(
        "ws-1",
        "member",
        [{ action: "permission.grant_edit", effect: "allow" }],
        actor,
      ),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test("permissions: member override beats role grant", async () => {
  const store = new MemoryPermissionsStore();
  await store.replaceRoleGrants(
    "ws-1",
    "member",
    [{ action: "invite.create", effect: "allow" }],
    actor.userId,
  );
  await store.replaceMemberOverrides(
    "ws-1",
    "22222222-2222-4222-8222-222222222222",
    [{ action: "invite.create", effect: "deny" }],
    actor.userId,
  );
  const roleGrants = await store.listRoleGrants("ws-1", "member");
  const memberOverrides = await store.listMemberOverrides(
    "ws-1",
    "22222222-2222-4222-8222-222222222222",
  );
  const grant = resolveGrantLayers({
    action: "invite.create",
    roleGrants,
    memberOverrides,
  });
  assert.equal(grant?.source, "member_override");
  assert.equal(grant?.allowed, false);
});

test("permissions store: revoke clears active deputy", async () => {
  const store = new MemoryPermissionsStore();
  const row = await store.createDeputyWindow({
    workspaceId: "ws-1",
    userId: "u1",
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 10_000),
    reason: "x",
    createdByUserId: "owner",
  });
  assert.ok(await store.findActiveDeputyWindow("ws-1", "u1"));
  await store.revokeDeputyWindow(row.id, "ws-1");
  assert.equal(await store.findActiveDeputyWindow("ws-1", "u1"), null);
});

test("permissions: policy-audit returns builtin registry", async () => {
  const store = new MemoryPermissionsStore();
  const svc = new PermissionsService(store, undefined);
  const audit = await svc.getPolicyAudit("ws-1", actor);
  assert.equal(audit.source, "builtin_registry");
  assert.equal(audit.workspaceId, "ws-1");
  assert.ok(audit.policies.length >= 5);
  assert.ok(audit.policies.every((p) => p.policyId.startsWith("builtin.")));
});
