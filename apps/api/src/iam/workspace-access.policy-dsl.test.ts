import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { WorkspaceAccessService } from "./workspace-access.service.js";
import type { IamStore } from "./iam.types.js";

const workspaceId = "ws-policy-dsl";
const userId = "user-approver";

function iamWithRole(role: string): IamStore {
  return {
    persistence: "memory",
    listMembers: async () => [{ userId, role, displayName: "Tester" }],
    getWorkspaceForUser: async () => ({
      id: workspaceId,
      template: "small_team",
    }),
  } as unknown as IamStore;
}

test("requireAccess denies when Policy DSL fails after ABAC allow", async () => {
  const access = new WorkspaceAccessService(iamWithRole("finance"));
  // ABAC allows finance + non-posted/reversed status; DSL requires draft|submitted.
  await assert.rejects(
    () =>
      access.requireAccess(workspaceId, userId, "expense.approve", {
        status: "cancelled",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenException);
      const body = err.getResponse() as { code?: string; detail?: string };
      assert.equal(body.code, "DENY_ATTRIBUTE");
      assert.match(String(body.detail), /Policy DSL denied|builtin\.expense\.approve/);
      return true;
    },
  );
});

test("requireAccess allows when Policy DSL and ABAC agree", async () => {
  const access = new WorkspaceAccessService(iamWithRole("finance"));
  const result = await access.requireAccess(workspaceId, userId, "expense.approve", {
    status: "submitted",
  });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.role, "finance");
});

test("a denied access check records a security event", async () => {
  const emitted: Array<{ name: string; workspaceId?: string }> = [];
  const recorder = {
    emit: (name: string, partial: { workspaceId?: string } = {}) => {
      emitted.push({ name, workspaceId: partial.workspaceId });
      return {} as never;
    },
  };
  const access = new WorkspaceAccessService(
    iamWithRole("finance"),
    recorder as never,
  );

  await assert.rejects(() =>
    access.requireAccess(workspaceId, userId, "expense.approve", {
      status: "cancelled",
    }),
  );
  assert.deepEqual(
    emitted.map((row) => row.name),
    ["access.policy_denied"],
    "the recorder must actually be reachable from here",
  );
  assert.equal(emitted[0]?.workspaceId, workspaceId);
});

test("requireAccess denies settlement.dispute when isParty false for member", async () => {
  const access = new WorkspaceAccessService(iamWithRole("member"));
  await assert.rejects(
    () =>
      access.requireAccess(workspaceId, userId, "settlement.dispute", {
        isParty: false,
        status: "claimed",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenException);
      return true;
    },
  );
});

test("requireAccess denies deputy when amount exceeds approvalCapMinor", async () => {
  const permissions = {
    listRoleGrants: async () => [],
    listMemberOverrides: async () => [],
    findActiveDeputyWindow: async () => ({
      id: "dw-1",
      workspaceId,
      userId,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      reason: "cover",
      approvalCapMinor: "1000",
      revokedAt: null,
      createdAt: new Date().toISOString(),
    }),
  };
  const access = new WorkspaceAccessService(
    iamWithRole("member"),
    undefined,
    permissions as never,
  );
  await assert.rejects(
    () =>
      access.requireAccess(workspaceId, userId, "expense.approve", {
        status: "submitted",
        amountMinor: "5000",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ForbiddenException);
      const body = err.getResponse() as { code?: string; detail?: string };
      assert.equal(body.code, "DENY_ATTRIBUTE");
      assert.match(String(body.detail), /سقف تأیید جانشین/);
      return true;
    },
  );
});

test("requireAccess allows deputy when amount is within approvalCapMinor", async () => {
  const permissions = {
    listRoleGrants: async () => [],
    listMemberOverrides: async () => [],
    findActiveDeputyWindow: async () => ({
      id: "dw-2",
      workspaceId,
      userId,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      reason: "cover",
      approvalCapMinor: "10000",
      revokedAt: null,
      createdAt: new Date().toISOString(),
    }),
  };
  const access = new WorkspaceAccessService(
    iamWithRole("member"),
    undefined,
    permissions as never,
  );
  const result = await access.requireAccess(workspaceId, userId, "expense.approve", {
    status: "submitted",
    amountMinor: "5000",
  });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.role, "finance");
});
