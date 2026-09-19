import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
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
    requireAccess: async () => ({ role }),
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
    {
      balancesForWorkspace: async () => [],
      postSettlement: async () => ({
        id: "j1",
        workspaceId: "ws1",
        sourceType: "settlement",
        sourceId: "x",
        status: "posted",
        currency: "IRR",
        lines: [],
        idempotencyKey: "ik",
        actorUserId: "alice",
        createdAt: new Date().toISOString(),
      }),
      db: undefined,
    } as never,
    access as never,
    { append: async () => undefined } as never,
    idempotency as never,
    { insert: async () => ({ id: "o1" }), db: undefined } as never,
    {
      correlation: () => ({ requestId: "r1", traceId: "t1" }),
      dispatch: async () => undefined,
    } as never,
    { assertMfaEnrolledForFinanceAction: async () => onMfa() } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
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

test("creditor can confirm open debt-simplify claims via batch endpoint", async () => {
  const previous = process.env.ENABLE_DEBT_SIMPLIFY_API;
  process.env.ENABLE_DEBT_SIMPLIFY_API = "1";
  try {
    const { DEBT_SIMPLIFY_CLAIM_NOTE } = await import("@dang/contracts");
    const shared = new MemorySettlementStore();
    const noopIdempotency = {
      run: async (
        _scope: string,
        _actorUserId: string,
        _key: string,
        operation: () => Promise<unknown>,
      ) => operation(),
    };
    const ledgerStub = {
      balancesForWorkspace: async () => [],
      postSettlement: async () => ({
        id: "j1",
        workspaceId: "ws1",
        sourceType: "settlement" as const,
        sourceId: "x",
        status: "posted" as const,
        currency: "IRR" as const,
        lines: [],
        idempotencyKey: "ik",
        actorUserId: "alice",
        createdAt: new Date().toISOString(),
      }),
      db: undefined,
    };
    const financeAccess = {
      requireMemberRole: async () => "finance" as const,
      assertNotReadOnly: () => undefined,
      requireMember: async () => undefined,
      requireAccess: async () => ({ role: "finance" as const }),
    };
    const memberAccess = {
      requireMemberRole: async () => "member" as const,
      assertNotReadOnly: () => undefined,
      requireMember: async () => undefined,
      requireAccess: async () => ({ role: "member" as const }),
    };
    const fin = new SettlementsService(
      shared,
      ledgerStub as never,
      financeAccess as never,
      { append: async () => undefined } as never,
      noopIdempotency as never,
      { insert: async () => ({ id: "o1" }), db: undefined } as never,
      { correlation: () => ({ requestId: "r1", traceId: "t1" }), dispatch: async () => undefined } as never,
      { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
      {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
      { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
    );
    const claim = await fin.createClaim(alice, "ws1", {
      workspaceId: "ws1",
      fromUserId: "bob",
      toUserId: "alice",
      amount: { amountMinor: "500", currency: "IRR" },
      note: DEBT_SIMPLIFY_CLAIM_NOTE,
      idempotencyKey: "simplify-seed-2",
    });
    assert.equal(claim.note, DEBT_SIMPLIFY_CLAIM_NOTE);

    const mem = new SettlementsService(
      shared,
      ledgerStub as never,
      memberAccess as never,
      { append: async () => undefined } as never,
      noopIdempotency as never,
      { insert: async () => ({ id: "o2" }), db: undefined } as never,
      { correlation: () => ({ requestId: "r1", traceId: "t1" }), dispatch: async () => undefined } as never,
      { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
      {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
      { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
    );
    const result = await mem.confirmSimplifyClaims(alice, "ws1", {
      idempotencyKey: "confirm-batch",
      settlementIds: [claim.id],
    });
    assert.equal(result.confirmed.length, 1);
    assert.equal(result.confirmed[0]?.status, "confirmed");
    assert.equal(result.failed.length, 0);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_DEBT_SIMPLIFY_API;
    else process.env.ENABLE_DEBT_SIMPLIFY_API = previous;
  }
});

test("confirmSimplifyClaims rejects when feature flag off", async () => {
  const previous = process.env.ENABLE_DEBT_SIMPLIFY_API;
  process.env.ENABLE_DEBT_SIMPLIFY_API = "0";
  try {
    const service = serviceForRole("finance");
    await assert.rejects(
      service.confirmSimplifyClaims(alice, "ws1", {
        idempotencyKey: "flag-off",
      }),
      ForbiddenException,
    );
  } finally {
    if (previous === undefined) delete process.env.ENABLE_DEBT_SIMPLIFY_API;
    else process.env.ENABLE_DEBT_SIMPLIFY_API = previous;
  }
});

test("confirmSimplifyClaims skips non-simplify notes and skips debtor", async () => {
  const previous = process.env.ENABLE_DEBT_SIMPLIFY_API;
  process.env.ENABLE_DEBT_SIMPLIFY_API = "1";
  try {
    const { DEBT_SIMPLIFY_CLAIM_NOTE } = await import("@dang/contracts");
    const shared = new MemorySettlementStore();
    const noopIdempotency = {
      run: async (
        _s: string,
        _a: string,
        _k: string,
        op: () => Promise<unknown>,
      ) => op(),
    };
    const ledgerStub = {
      balancesForWorkspace: async () => [],
      postSettlement: async () => ({
        id: "j1",
        workspaceId: "ws1",
        sourceType: "settlement",
        sourceId: "x",
        status: "posted",
        currency: "IRR",
        lines: [],
        idempotencyKey: "ik",
        actorUserId: "bob",
        createdAt: new Date().toISOString(),
      }),
      db: undefined,
    };
    const fin = new SettlementsService(
      shared,
      ledgerStub as never,
      {
        requireMemberRole: async () => "finance",
        assertNotReadOnly: () => undefined,
        requireMember: async () => undefined,
        requireAccess: async () => ({ role: "finance" as const }),
      } as never,
      { append: async () => undefined } as never,
      noopIdempotency as never,
      { insert: async () => ({ id: "o1" }), db: undefined } as never,
      {
        correlation: () => ({ requestId: "r1", traceId: "t1" }),
        dispatch: async () => undefined,
      } as never,
      { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
      {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
      { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
    );
    await fin.createClaim(alice, "ws1", {
      workspaceId: "ws1",
      fromUserId: "bob",
      toUserId: "alice",
      amount: { amountMinor: "100", currency: "IRR" },
      note: "manual note",
      idempotencyKey: "manual-1",
    });
    const simplify = await fin.createClaim(alice, "ws1", {
      workspaceId: "ws1",
      fromUserId: "bob",
      toUserId: "alice",
      amount: { amountMinor: "200", currency: "IRR" },
      note: DEBT_SIMPLIFY_CLAIM_NOTE,
      idempotencyKey: "simplify-1",
    });

    const bob = {
      userId: "bob",
      externalSubject: "bob",
      displayName: "Bob",
      authMode: "dev" as const,
    };
    const debtorSvc = new SettlementsService(
      shared,
      ledgerStub as never,
      {
        requireMemberRole: async () => "member",
        assertNotReadOnly: () => undefined,
        requireMember: async () => undefined,
        requireAccess: async () => ({ role: "member" as const }),
      } as never,
      { append: async () => undefined } as never,
      noopIdempotency as never,
      { insert: async () => ({ id: "o2" }), db: undefined } as never,
      {
        correlation: () => ({ requestId: "r2", traceId: "t2" }),
        dispatch: async () => undefined,
      } as never,
      { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
      {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
      { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
    );
    const result = await debtorSvc.confirmSimplifyClaims(bob, "ws1", {
      idempotencyKey: "debtor-try",
      settlementIds: [simplify.id],
    });
    assert.equal(result.confirmed.length, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed.length, 0);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_DEBT_SIMPLIFY_API;
    else process.env.ENABLE_DEBT_SIMPLIFY_API = previous;
  }
});

test("previewSettlementEffect projects live balances and rejects same party", async () => {
  const service = new SettlementsService(
    new MemorySettlementStore(),
    {
      balancesForWorkspace: async () => [
        { userId: "alice", net: { amountMinor: "100", currency: "IRR" } },
        { userId: "bob", net: { amountMinor: "-100", currency: "IRR" } },
      ],
      postSettlement: async () => {
        throw new Error("not used");
      },
      db: undefined,
    } as never,
    {
      requireMemberRole: async () => "member",
      assertNotReadOnly: () => undefined,
      requireMember: async () => undefined,
      requireAccess: async () => ({ role: "member" as const }),
    } as never,
    { append: async () => undefined } as never,
    {
      run: async (
        _s: string,
        _a: string,
        _k: string,
        op: () => Promise<unknown>,
      ) => op(),
    } as never,
    { insert: async () => ({ id: "o1" }), db: undefined } as never,
    {
      correlation: () => ({ requestId: "r1", traceId: "t1" }),
      dispatch: async () => undefined,
    } as never,
    { assertMfaEnrolledForFinanceAction: async () => undefined } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
    } as never,
    { emit: () => ({}) } as never,
    { notifySettlementClaimed: async () => undefined, notifySettlementConfirmed: async () => undefined } as never,
  );

  const preview = await service.previewSettlementEffect(alice, "ws1", {
    transfers: [
      {
        fromUserId: "bob",
        toUserId: "alice",
        amount: { amountMinor: "100", currency: "IRR" },
      },
    ],
  });
  assert.equal(preview.zeroSumBefore, true);
  assert.equal(preview.after.length, 0);
  assert.equal(preview.zeroSumAfter, true);

  await assert.rejects(
    service.previewSettlementEffect(alice, "ws1", {
      transfers: [
        {
          fromUserId: "alice",
          toUserId: "alice",
          amount: { amountMinor: "10", currency: "IRR" },
        },
      ],
    }),
    BadRequestException,
  );
});

