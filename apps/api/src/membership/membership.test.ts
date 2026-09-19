import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { wouldRemoveLastFinanceManager } from "../iam/membership-rules.js";
import { MembershipService } from "./membership.service.js";

async function seedActors(iam: MemoryIamStore) {
  const owner = await iam.upsertDevActor({
    externalSubject: `owner-${crypto.randomUUID()}@test`,
    displayName: "Owner",
  });
  const finance = await iam.upsertDevActor({
    externalSubject: `finance-${crypto.randomUUID()}@test`,
    displayName: "Finance",
  });
  const outsider = await iam.upsertDevActor({
    externalSubject: `outsider-${crypto.randomUUID()}@test`,
    displayName: "Outsider",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Team",
    slug: `team-${crypto.randomUUID().slice(0, 8)}`,
    template: "small_team",
  });
  await iam.addMemberByUserId({
    workspaceId: workspace.id,
    actorUserId: owner.userId,
    userId: finance.userId,
    role: "finance",
    addedVia: "user_id",
  });
  return { owner, finance, outsider, workspace };
}

function actorOf(row: { userId: string; externalSubject: string; displayName: string }) {
  return {
    userId: row.userId,
    externalSubject: row.externalSubject,
    displayName: row.displayName,
    authMode: "dev" as const,
  };
}

test("S11-03 cannot remove last finance manager", async () => {
  assert.equal(
    wouldRemoveLastFinanceManager(
      [
        { userId: "a", role: "finance", disabledAt: null },
        { userId: "b", role: "member", disabledAt: null },
      ],
      "a",
      { nextRole: "member" },
    ),
    true,
  );
  assert.equal(
    wouldRemoveLastFinanceManager(
      [
        { userId: "a", role: "finance", disabledAt: null },
        { userId: "b", role: "owner", disabledAt: null },
      ],
      "a",
      { disabling: true },
    ),
    false,
  );

  const iam = new MemoryIamStore();
  const service = new MembershipService(iam, new MemoryAuditStore());
  const { owner, finance, workspace } = await seedActors(iam);

  // Demote backup while owner remains — ok.
  await service.updateMember(actorOf(owner), workspace.id, finance.userId, {
    role: "member",
  });

  // Sole remaining finance manager is the owner — demoting them is blocked.
  await assert.rejects(
    () =>
      service.updateMember(actorOf(owner), workspace.id, owner.userId, {
        role: "member",
      }),
    (err: unknown) => {
      const body = (err as { getResponse: () => { code?: string } }).getResponse();
      assert.equal(body.code, "LAST_FINANCE_MANAGER");
      return true;
    },
  );

  // Restore backup; demoting owner still requires ownership transfer.
  await service.updateMember(actorOf(owner), workspace.id, finance.userId, {
    role: "finance",
  });
  await assert.rejects(
    () =>
      service.updateMember(actorOf(owner), workspace.id, owner.userId, {
        role: "admin",
      }),
    (err: unknown) => {
      const body = (err as { getResponse: () => { code?: string } }).getResponse();
      assert.equal(body.code, "MEMBERSHIP_FORBIDDEN");
      return true;
    },
  );

  await service.disableMember(actorOf(owner), workspace.id, finance.userId, {
    reason: "left",
  });
  await assert.rejects(
    () =>
      service.disableMember(actorOf(owner), workspace.id, owner.userId, {
        reason: "nope",
      }),
    (err: unknown) => {
      const body = (err as { getResponse: () => { code?: string } }).getResponse();
      assert.equal(body.code, "MEMBERSHIP_FORBIDDEN");
      return true;
    },
  );
});

test("S11-03 join request approve adds membership", async () => {
  const iam = new MemoryIamStore();
  const service = new MembershipService(iam, new MemoryAuditStore());
  const { owner, outsider, workspace } = await seedActors(iam);

  const req = await service.createJoinRequest(actorOf(outsider), workspace.slug, {
    message: "please",
  });
  assert.equal(req.status, "pending");

  const listed = await service.listJoinRequests(actorOf(owner), workspace.id);
  assert.equal(listed.length, 1);

  const approved = await service.approveJoinRequest(actorOf(owner), workspace.id, req.id, {
    role: "member",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.grantedRole, "member");

  const members = await iam.listMembers(workspace.id, owner.userId);
  const joined = members?.find((m) => m.userId === outsider.userId);
  assert.ok(joined);
  assert.equal(joined.addedVia, "join_request");
  assert.equal(joined.role, "member");
});

test("S11-03 ownership transfer requires accept", async () => {
  const iam = new MemoryIamStore();
  const service = new MembershipService(iam, new MemoryAuditStore());
  const { owner, finance, workspace } = await seedActors(iam);

  const proposed = await service.proposeOwnershipTransfer(actorOf(owner), workspace.id, {
    toUserId: finance.userId,
  });
  assert.equal(proposed.status, "pending");

  const before = await iam.listMembers(workspace.id, owner.userId);
  assert.equal(before?.find((m) => m.userId === owner.userId)?.role, "owner");
  assert.equal(before?.find((m) => m.userId === finance.userId)?.role, "finance");

  await assert.rejects(
    () => service.acceptOwnershipTransfer(actorOf(owner), workspace.id, proposed.id),
    (err: unknown) => {
      const body = (err as { getResponse: () => { code?: string } }).getResponse();
      assert.equal(body.code, "MEMBERSHIP_FORBIDDEN");
      return true;
    },
  );

  const mid = await iam.listMembers(workspace.id, owner.userId);
  assert.equal(mid?.find((m) => m.userId === owner.userId)?.role, "owner");

  const accepted = await service.acceptOwnershipTransfer(
    actorOf(finance),
    workspace.id,
    proposed.id,
  );
  assert.equal(accepted.status, "accepted");

  const after = await iam.listMembers(workspace.id, finance.userId);
  assert.equal(after?.find((m) => m.userId === finance.userId)?.role, "owner");
  assert.equal(after?.find((m) => m.userId === owner.userId)?.role, "admin");
});

test("S11-03 list pending ownership transfers across sessions", async () => {
  const iam = new MemoryIamStore();
  const service = new MembershipService(iam, new MemoryAuditStore());
  const { owner, finance, workspace } = await seedActors(iam);

  const proposed = await service.proposeOwnershipTransfer(actorOf(owner), workspace.id, {
    toUserId: finance.userId,
  });
  const listed = await service.listOwnershipTransfers(actorOf(finance), workspace.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, proposed.id);
  assert.equal(listed[0]?.status, "pending");
  assert.equal(listed[0]?.toUserId, finance.userId);
});

test("S11-03 finance can add existing user but cannot mint invites", async () => {
  const iam = new MemoryIamStore();
  const { finance, outsider, workspace } = await seedActors(iam);

  const added = await iam.addMemberByUserId({
    workspaceId: workspace.id,
    actorUserId: finance.userId,
    userId: outsider.userId,
    role: "member",
    addedVia: "user_id",
  });
  assert.equal(added.userId, outsider.userId);

  await assert.rejects(
    () =>
      iam.createInvite({
        workspaceId: workspace.id,
        actorUserId: finance.userId,
        role: "member",
      }),
    (err: unknown) => err instanceof Error && err.message === "CANNOT_CREATE_USER_ACCOUNT",
  );

  await assert.rejects(
    () =>
      iam.addMemberByUserId({
        workspaceId: workspace.id,
        actorUserId: finance.userId,
        userId: crypto.randomUUID(),
        role: "member",
        addedVia: "user_id",
      }),
    (err: unknown) => err instanceof Error && err.message === "CANNOT_CREATE_USER_ACCOUNT",
  );
});
