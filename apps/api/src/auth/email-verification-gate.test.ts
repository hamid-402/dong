import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { groupEmailVerificationEnforced } from "@dang/config";
import type { AuthActor } from "@dang/contracts";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { ExpensesService } from "../expenses/expenses.service.js";
import { MemorySettlementStore } from "../settlements/memory-settlement.store.js";
import { SettlementsService } from "../settlements/settlements.service.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";
import {
  EMAIL_NOT_VERIFIED,
  EMAIL_NOT_VERIFIED_DETAIL,
  EmailVerificationGate,
} from "./email-verification-gate.js";

const enforced = { allowDevAuth: false, requireEmailVerification: true };
const devAuth = { allowDevAuth: true, requireEmailVerification: true };

test("email verification for group actions stays off while DevAuth is on", () => {
  assert.equal(groupEmailVerificationEnforced(devAuth), false);
  assert.equal(
    groupEmailVerificationEnforced({ allowDevAuth: false, requireEmailVerification: false }),
    false,
  );
  assert.equal(groupEmailVerificationEnforced(enforced), true);
});

test("unverified accounts are blocked only when the environment enforces it", async () => {
  const accounts = {
    findById: async () => ({ emailVerifiedAt: null, email: "a@example.com" }),
  };
  const gate = new EmailVerificationGate(accounts as never);
  await gate.assertVerifiedForGroupAction("u1", devAuth);
  await assert.rejects(
    () => gate.assertVerifiedForGroupAction("u1", enforced),
    (error: unknown) => {
      if (!(error instanceof ForbiddenException)) return false;
      const body = error.getResponse() as { code?: string; detail?: string };
      return body.code === EMAIL_NOT_VERIFIED && body.detail === EMAIL_NOT_VERIFIED_DETAIL;
    },
  );

  const verified = new EmailVerificationGate({
    findById: async () => ({ emailVerifiedAt: new Date(), email: "a@example.com" }),
  } as never);
  await verified.assertVerifiedForGroupAction("u1", enforced);
});

function throwingGate() {
  const state = { calls: 0 };
  const gate = {
    assertVerifiedForGroupAction: async () => {
      state.calls += 1;
      throw new ForbiddenException({
        status: 403,
        code: EMAIL_NOT_VERIFIED,
        detail: EMAIL_NOT_VERIFIED_DETAIL,
      });
    },
  } as unknown as EmailVerificationGate;
  return { state, gate };
}

const actor: AuthActor = {
  userId: "alice",
  externalSubject: "alice",
  displayName: "Alice",
  authMode: "password",
};

test("group workspace create is blocked and personal create is not", async () => {
  const iam = new MemoryIamStore();
  const owner = await iam.upsertDevActor({
    externalSubject: "group-owner",
    displayName: "Owner",
  });
  const { state, gate } = throwingGate();
  const service = new WorkspacesService(
    iam,
    new MemoryAuditStore(),
    undefined as never,
    undefined as never,
    gate,
  );

  const personal = await service.create(owner, {
    name: "دفتر من",
    slug: "my-notebook",
    template: "personal",
  });
  assert.equal(personal.template, "personal");
  assert.equal(state.calls, 0);

  await assert.rejects(
    () =>
      service.create(owner, {
        name: "دوستان",
        slug: "friends-mail",
        template: "friends_family",
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(state.calls, 1);
});

test("group expense draft is blocked and a personal draft is not", async () => {
  const { state, gate } = throwingGate();
  let template = "friends_family";
  const store = new MemoryExpenseStore();
  const service = new ExpensesService(
    store,
    { get: async () => ({ approvalThresholdMinor: null, requireReceiptAboveMinor: null }) } as never,
    {} as never,
    {
      getWorkspaceForUser: async () => ({ template }),
      listMembers: async () => [{ userId: "alice", role: "owner" }],
    } as never,
    {
      requireAccess: async () => ({ role: "owner", decision: { allowed: true } }),
      requireMember: async () => undefined,
      assertNotReadOnly: () => undefined,
    } as never,
    { append: async () => undefined } as never,
    {} as never,
    {
      run: async (_s: string, _u: string, _k: string, fn: () => Promise<unknown>) => fn(),
    } as never,
    {} as never,
    {} as never,
    { listForTarget: async () => [] } as never,
    { createFirst: async () => null, approve: async () => undefined, pending: async () => [] } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { recordUsage: async () => undefined } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    gate,
  );

  await assert.rejects(
    () =>
      service.createDraft(actor, "ws1", {
        workspaceId: "ws1",
        title: "شام",
        total: { amountMinor: "2000", currency: "IRR" },
        paidByUserId: "alice",
        splitMethod: "equal",
        participantUserIds: ["alice"],
        occurredOn: "2026-09-07",
        idempotencyKey: "group-mail",
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(state.calls, 1);

  template = "personal";
  const personal = await service.createDraft(actor, "ws1", {
    workspaceId: "ws1",
    title: "شخصی",
    total: { amountMinor: "2000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice"],
    occurredOn: "2026-09-07",
    idempotencyKey: "personal-mail",
  });
  assert.equal(personal.title, "شخصی");
  assert.equal(state.calls, 1);
});

test("group settlement claim and confirm are blocked until email is verified", async () => {
  const store = new MemorySettlementStore();
  const { state, gate } = throwingGate();
  let template = "friends_family";
  const access = {
    requireMemberRole: async () => "member" as const,
    assertNotReadOnly: () => undefined,
    requireMember: async (_workspaceId: string, userId: string) => {
      if (userId !== "alice" && userId !== "bob") {
        throw new ForbiddenException("not a member");
      }
    },
    requireAccess: async () => ({ role: "member" as const }),
  };
  const service = new SettlementsService(
    store,
    { balancesForWorkspace: async () => [], postSettlement: async () => ({ id: "j" }), db: undefined } as never,
    access as never,
    { append: async () => undefined } as never,
    {
      run: async (_s: string, _u: string, _k: string, fn: () => Promise<unknown>) => fn(),
    } as never,
    { insert: async () => ({ id: "o1" }), db: undefined } as never,
    { correlation: () => ({ requestId: "r", traceId: "t" }), dispatch: async () => undefined } as never,
    { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
    { assertFourEyes: async () => undefined, applyTierGate: async () => ({ outcome: "bypass" }) } as never,
    { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
    undefined,
    { getWorkspaceForUser: async () => ({ template }) } as never,
    gate,
  );

  await assert.rejects(
    () =>
      service.createClaim(actor, "ws1", {
        workspaceId: "ws1",
        fromUserId: "alice",
        toUserId: "bob",
        amount: { amountMinor: "1000", currency: "IRR" },
        idempotencyKey: "claim-mail",
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(state.calls, 1);

  const claimed = await store.createClaim("alice", {
    workspaceId: "ws1",
    fromUserId: "bob",
    toUserId: "alice",
    amount: { amountMinor: "1000", currency: "IRR" },
    idempotencyKey: "confirm-mail",
  });
  await assert.rejects(
    () => service.confirm(actor, "ws1", claimed.id),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(state.calls, 2);

  template = "personal";
  const personalClaim = await service.createClaim(actor, "ws1", {
    workspaceId: "ws1",
    fromUserId: "alice",
    toUserId: "bob",
    amount: { amountMinor: "500", currency: "IRR" },
    idempotencyKey: "personal-claim",
  });
  assert.equal(personalClaim.fromUserId, "alice");
  assert.equal(state.calls, 2);
});
