import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateExpenseSplit,
  computeProvisionalBalances,
} from "@dang/contracts";
import { canActorViewExpense } from "./expense.types.js";
import { MemoryExpenseStore } from "./memory-expense.store.js";

test("private expense is hidden from other members in list", async () => {
  const store = new MemoryExpenseStore();
  const created = await store.createDraft("alice", {
    workspaceId: "ws1",
    title: "یادداشت خصوصی",
    total: { amountMinor: "1000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice"],
    occurredOn: "2026-09-01",
    visibility: "private",
    idempotencyKey: "priv-1",
  });
  const forAlice = await store.listForWorkspace("ws1", "alice");
  const forBob = await store.listForWorkspace("ws1", "bob");
  assert.equal(forAlice.some((e) => e.id === created.id), true);
  assert.equal(forBob.some((e) => e.id === created.id), false);
  assert.equal(
    canActorViewExpense(
      {
        visibility: "private",
        paidByUserId: "alice",
        participantUserIds: ["alice"],
        createdByUserId: "alice",
        paymentLines: [{ userId: "alice", amount: { amountMinor: "1000", currency: "IRR" } }],
      },
      "bob",
    ),
    false,
  );
});

test("private self-expense does not change peer net balances", () => {
  const total = { amountMinor: "5000", currency: "IRR" as const };
  const splits = allocateExpenseSplit({
    total,
    splitMethod: "equal",
    participantUserIds: ["alice"],
  });
  const lines = computeProvisionalBalances(
    [
      {
        id: "e1",
        paidByUserId: "alice",
        paymentLines: [{ userId: "alice", amount: total }],
        total,
        splits,
        status: "posted",
      },
    ],
    [],
  );
  assert.equal(lines.some((l) => l.userId === "bob"), false);
  // Self-paid private: net for alice is zero and may be omitted from projection.
  const alice = lines.find((l) => l.userId === "alice");
  if (alice) assert.equal(alice.net.amountMinor, "0");
});

test("preview allocateExpenseSplit matches itemized tip/tax sum", () => {
  const total = { amountMinor: "11000", currency: "IRR" as const };
  const splits = allocateExpenseSplit({
    total,
    splitMethod: "itemized",
    participantUserIds: ["a", "b"],
    items: [
      {
        title: "x",
        amount: { amountMinor: "10000", currency: "IRR" },
        assigneeUserIds: ["a", "b"],
      },
    ],
    tip: { amountMinor: "1000", currency: "IRR" },
  });
  const sum = splits.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  assert.equal(sum, 11000n);
});
