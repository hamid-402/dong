import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";
import { ExpensesService } from "./expenses.service.js";
import {
  ExpensePartyNotMemberError,
  assertExpensePartiesAreActiveMembers,
} from "./expense-party-membership.js";

const actor: AuthActor = {
  userId: "alice",
  externalSubject: "dev|alice",
  displayName: "Alice",
  authMode: "dev",
};

const activeMembers = [
  { userId: "alice", disabledAt: null },
  { userId: "bob", disabledAt: undefined },
  { userId: "gone", disabledAt: "2026-01-01T00:00:00.000Z" },
];

test("active members pass and outsiders or disabled members fail", () => {
  assert.doesNotThrow(() =>
    assertExpensePartiesAreActiveMembers({
      paidByUserId: "alice",
      splits: [{ userId: "alice" }, { userId: "bob" }],
      paymentLines: [{ userId: "bob" }],
      members: activeMembers,
    }),
  );

  assert.throws(
    () =>
      assertExpensePartiesAreActiveMembers({
        paidByUserId: "stranger",
        splits: [{ userId: "alice" }],
        members: activeMembers,
      }),
    (error: unknown) =>
      error instanceof ExpensePartyNotMemberError &&
      error.code === "PAYER_NOT_MEMBER" &&
      error.detail.includes("پرداخت‌کننده"),
  );

  assert.throws(
    () =>
      assertExpensePartiesAreActiveMembers({
        paidByUserId: "alice",
        splits: [{ userId: "gone" }],
        members: activeMembers,
      }),
    (error: unknown) =>
      error instanceof ExpensePartyNotMemberError &&
      error.code === "PARTICIPANT_NOT_MEMBER" &&
      error.detail.includes("شرکت‌کننده"),
  );
});

function serviceWithMembers(
  store: MemoryExpenseStore,
  members: Array<{ userId: string; role?: string; disabledAt?: string | null }>,
  workspaceForActor: { template: string } | undefined,
) {
  const iam = {
    getWorkspaceForUser: async () => workspaceForActor,
    listMembers: async () =>
      workspaceForActor
        ? members.map((member) => ({
            userId: member.userId,
            role: member.role ?? "member",
            disabledAt: member.disabledAt,
          }))
        : undefined,
  };
  return new ExpensesService(
    store,
    {
      get: async () => ({
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
        requireReceiptCategoryIds: [],
      }),
    } as never,
    {} as never,
    iam as never,
    new WorkspaceAccessService(iam as never),
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
      resolveThresholdMinor: async () => null,
    } as never,
    { recordUsage: async () => undefined } as never,
  );
}

const draft = {
  workspaceId: "ws1",
  title: "ناهار",
  total: { amountMinor: "1000", currency: "IRR" as const },
  occurredOn: "2026-09-07",
  splitMethod: "equal" as const,
};

test("createDraft rejects a payer or participant who is not an active member", async () => {
  const store = new MemoryExpenseStore();
  const service = serviceWithMembers(
    store,
    [
      { userId: "alice", role: "owner" },
      { userId: "bob", role: "member" },
      { userId: "gone", role: "member", disabledAt: "2026-01-01T00:00:00.000Z" },
    ],
    { template: "friends_family" },
  );

  await assert.rejects(
    () =>
      service.createDraft(actor, "ws1", {
        ...draft,
        paidByUserId: "stranger",
        participantUserIds: ["alice"],
        idempotencyKey: "payer-out",
      }),
    (error: unknown) => {
      if (!(error instanceof BadRequestException)) return false;
      const body = error.getResponse() as { detail?: string; code?: string };
      return body.code === "PAYER_NOT_MEMBER" && Boolean(body.detail?.includes("پرداخت‌کننده"));
    },
  );

  await assert.rejects(
    () =>
      service.createDraft(actor, "ws1", {
        ...draft,
        paidByUserId: "alice",
        participantUserIds: ["alice", "gone"],
        idempotencyKey: "disabled-split",
      }),
    (error: unknown) => {
      if (!(error instanceof BadRequestException)) return false;
      const body = error.getResponse() as { detail?: string; code?: string };
      return body.code === "PARTICIPANT_NOT_MEMBER" && Boolean(body.detail?.includes("شرکت‌کننده"));
    },
  );

  const created = await service.createDraft(actor, "ws1", {
    ...draft,
    paidByUserId: "bob",
    participantUserIds: ["alice", "bob"],
    idempotencyKey: "members-ok",
  });
  assert.equal(created.paidByUserId, "bob");
  assert.equal(store ? created.status : "", "draft");
});

test("post rejects a stored expense whose payer left the space", async () => {
  const store = new MemoryExpenseStore();
  const saved = await store.createDraft("alice", {
    ...draft,
    paidByUserId: "stranger",
    participantUserIds: ["alice"],
    idempotencyKey: "already-saved",
  });
  const service = serviceWithMembers(
    store,
    [{ userId: "alice", role: "owner" }],
    { template: "friends_family" },
  );

  await assert.rejects(
    () => service.post(actor, "ws1", saved.id),
    (error: unknown) => {
      if (!(error instanceof BadRequestException)) return false;
      const body = error.getResponse() as { code?: string; detail?: string };
      return body.code === "PAYER_NOT_MEMBER" && Boolean(body.detail?.includes("پرداخت‌کننده"));
    },
  );
  const still = await store.get("ws1", saved.id, "alice");
  assert.equal(still?.status, "draft");
});

test("previewSplit is limited to an active member of the workspace", async () => {
  const store = new MemoryExpenseStore();
  const outsider = serviceWithMembers(store, [], undefined);
  await assert.rejects(
    () =>
      outsider.previewSplit(actor, "ws1", {
        total: { amountMinor: "1000", currency: "IRR" },
        splitMethod: "equal",
        participantUserIds: ["alice", "bob"],
      }),
    (error: unknown) => error instanceof ForbiddenException,
  );

  const member = serviceWithMembers(
    store,
    [{ userId: "alice", role: "owner" }],
    { template: "friends_family" },
  );
  const preview = await member.previewSplit(actor, "ws1", {
    total: { amountMinor: "1000", currency: "IRR" },
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
  });
  assert.equal(preview.splits.length, 2);
  assert.equal(
    preview.splits.reduce((sum, line) => sum + Number(line.amount.amountMinor), 0),
    1000,
  );
});
