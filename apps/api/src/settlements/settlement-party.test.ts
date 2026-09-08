import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { isFinanceManagerRole } from "@dang/contracts";
import { MemorySettlementStore } from "./memory-settlement.store.js";
import { SettlementsService } from "./settlements.service.js";

test("settlement store get returns createdBy for ACL", async () => {
  const store = new MemorySettlementStore();
  const created = await store.createClaim("alice", {
    workspaceId: "ws1",
    fromUserId: "bob",
    toUserId: "alice",
    amount: { amountMinor: "1000", currency: "IRR" },
    idempotencyKey: "s1",
  });
  const loaded = await store.get("ws1", created.id, "alice");
  assert.equal(loaded?.createdByUserId, "alice");
  assert.equal(loaded?.toUserId, "alice");
});

test("finance manager role helper matches owner/admin/finance", () => {
  assert.equal(isFinanceManagerRole("member"), false);
  assert.equal(isFinanceManagerRole("finance"), true);
  assert.equal(isFinanceManagerRole("owner"), true);
});

function serviceForRole(role: "member" | "finance", onMfa = () => undefined) {
  const store = new MemorySettlementStore();
  const access = {
    requireMemberRole: async () => role,
    assertNotReadOnly: () => undefined,
    requireMember: async (_workspaceId: string, userId: string) => {
      if (!["alice", "bob", "carol"].includes(userId)) {
        throw new ForbiddenException("not a member");
      }
    },
  };
  const idempotency = {
    run: async (
      _scope: string,
      _actorUserId: string,
      _key: string,
      operation: () => Promise<unknown>,
    ) => operation(),
  };
  return new SettlementsService(
    store,
    {} as never,
    access as never,
    { append: async () => undefined } as never,
    idempotency as never,
    {} as never,
    { assertMfaEnrolledForFinanceAction: async () => onMfa() } as never,
  );
}

const alice = {
  userId: "alice",
  externalSubject: "alice",
  displayName: "Alice",
  authMode: "dev" as const,
};

test("regular member cannot create a settlement from another member account", async () => {
  const service = serviceForRole("member");

  await assert.rejects(
    service.createClaim(alice, "ws1", {
      workspaceId: "ws1",
      fromUserId: "bob",
      toUserId: "alice",
      amount: { amountMinor: "1000", currency: "IRR" },
      idempotencyKey: "spoofed-party",
    }),
    ForbiddenException,
  );
});

test("regular member can create a claim from self to another workspace member", async () => {
  const service = serviceForRole("member");

  const created = await service.createClaim(alice, "ws1", {
    workspaceId: "ws1",
    fromUserId: "alice",
    toUserId: "bob",
    amount: { amountMinor: "1000", currency: "IRR" },
    idempotencyKey: "self-party",
  });

  assert.equal(created.fromUserId, "alice");
  assert.equal(created.toUserId, "bob");
});

test("finance override for another debtor requires MFA", async () => {
  let mfaChecks = 0;
  const service = serviceForRole("finance", () => {
    mfaChecks += 1;
  });

  const created = await service.createClaim(alice, "ws1", {
    workspaceId: "ws1",
    fromUserId: "bob",
    toUserId: "carol",
    amount: { amountMinor: "1000", currency: "IRR" },
    idempotencyKey: "finance-override",
  });

  assert.equal(created.fromUserId, "bob");
  assert.equal(mfaChecks, 1);
});

test("materializing debt simplification is restricted to finance managers", async () => {
  const previous = process.env.ENABLE_DEBT_SIMPLIFY_API;
  process.env.ENABLE_DEBT_SIMPLIFY_API = "1";
  try {
    const service = serviceForRole("member");
    await assert.rejects(
      service.createSimplifyClaims(alice, "ws1", {
        idempotencyKey: "simplify-as-member",
      }),
      ForbiddenException,
    );
  } finally {
    if (previous === undefined) delete process.env.ENABLE_DEBT_SIMPLIFY_API;
    else process.env.ENABLE_DEBT_SIMPLIFY_API = previous;
  }
});
