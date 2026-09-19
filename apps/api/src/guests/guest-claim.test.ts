import assert from "node:assert/strict";
import test from "node:test";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import {
  hashClaimToken,
  MemoryGuestPlaceholderStore,
  mintClaimToken,
} from "./guest-placeholder.store.js";
import { GuestsService } from "./guests.service.js";
import { MemorySplitPresetStore } from "../split-presets/split-preset.store.js";

test("G04 guest claim remaps expense payer and ledger lines", async () => {
  const guests = new MemoryGuestPlaceholderStore();
  const expenses = new MemoryExpenseStore();
  const ledger = new MemoryLedgerStore();
  const token = mintClaimToken();
  const placeholder = await guests.create(
    "ws1",
    "owner",
    { displayName: "مهمان علی", idempotencyKey: "g1" },
    token,
    hashClaimToken(token),
  );

  const draft = await expenses.createDraft("owner", {
    workspaceId: "ws1",
    title: "ناهار با مهمان",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "owner",
    splitMethod: "equal",
    participantUserIds: ["owner", placeholder.id],
    occurredOn: "2026-09-19",
    idempotencyKey: "exp-guest-1",
  });
  await expenses.post("ws1", draft.id, "owner");
  const posted = await expenses.get("ws1", draft.id, "owner");
  assert.ok(posted);
  await ledger.postExpense("owner", {
    ...posted!,
    status: "posted",
  });

  const members = new Map<string, Array<{ userId: string; role: string }>>([
    ["ws1", [{ userId: "owner", role: "owner" }]],
  ]);
  const iam = {
    listMembers: async (workspaceId: string) => members.get(workspaceId) ?? [],
    addMemberByUserId: async (input: {
      workspaceId: string;
      userId: string;
      role: string;
    }) => {
      const list = members.get(input.workspaceId) ?? [];
      list.push({ userId: input.userId, role: input.role });
      members.set(input.workspaceId, list);
      return { userId: input.userId, role: input.role, defaultShares: 1 };
    },
  };

  const service = new GuestsService(
    guests,
    {
      requireMemberRole: async () => "owner",
      assertNotReadOnly: () => {},
      requireMember: async () => undefined,
    } as never,
    iam as never,
    expenses,
    ledger,
  );

  const claimer = {
    userId: "claimer",
    externalSubject: "claimer",
    displayName: "Claimer",
    authMode: "dev" as const,
  };
  const result = await service.claim(claimer, {
    claimToken: token,
    idempotencyKey: "claim-1",
  });
  assert.equal(result.placeholder.claimedUserId, "claimer");
  assert.ok(result.remappedExpenseCount >= 1);
  assert.ok(result.remappedLedgerLineCount >= 1);

  const after = await expenses.get("ws1", draft.id, "claimer");
  assert.ok(after?.participantUserIds.includes("claimer"));
  assert.ok(!after?.participantUserIds.includes(placeholder.id));

  const balances = await ledger.balancesForWorkspace("ws1", "claimer");
  assert.ok(balances.some((b) => b.userId === "claimer"));
  assert.ok(!balances.some((b) => b.userId === placeholder.id));
});

test("G04 split preset create + list", async () => {
  const store = new MemorySplitPresetStore();
  const created = await store.create("ws1", "u1", {
    name: "والدین ۲×",
    splitMethod: "shares",
    lines: [
      { userId: "dad", shares: 2 },
      { userId: "kid", shares: 1 },
    ],
    idempotencyKey: "p1",
  });
  assert.equal(created.splitMethod, "shares");
  const listed = await store.list("ws1");
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.lines[0]?.shares, 2);
});
