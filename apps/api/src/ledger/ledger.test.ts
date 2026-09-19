import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBalancedJournalLines,
  computeBalancesFromJournal,
  type ExpenseSummary,
} from "@dang/contracts";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryLedgerStore } from "./memory-ledger.store.js";
import { LedgerService } from "./ledger.service.js";

function postedExpense(
  partial: Pick<ExpenseSummary, "id" | "workspaceId"> & Partial<ExpenseSummary>,
): ExpenseSummary {
  return {
    id: partial.id,
    workspaceId: partial.workspaceId,
    title: partial.title ?? "ناهار",
    status: "posted",
    visibility: "shared",
    total: partial.total ?? { amountMinor: "10000", currency: "IRR" },
    paidByUserId: partial.paidByUserId ?? "u-payer",
    paymentLines: partial.paymentLines ?? [
      { userId: "u-payer", amount: { amountMinor: "10000", currency: "IRR" } },
    ],
    splitMethod: partial.splitMethod ?? "equal",
    participantUserIds: partial.participantUserIds ?? ["u-payer", "u-peer"],
    splits: partial.splits ?? [
      { userId: "u-payer", amount: { amountMinor: "5000", currency: "IRR" } },
      { userId: "u-peer", amount: { amountMinor: "5000", currency: "IRR" } },
    ],
    occurredOn: partial.occurredOn ?? "2026-09-01",
    createdAt: partial.createdAt ?? "2026-09-01T12:00:00.000Z",
    createdByUserId: partial.createdByUserId ?? "u-payer",
  };
}

test("ledger store posts balanced expense and lists for workspace", async () => {
  const store = new MemoryLedgerStore();
  const expense = postedExpense({ id: "exp-1", workspaceId: "ws-1" });
  const entry = await store.postExpense("u-payer", expense);
  assert.equal(entry.sourceType, "expense");
  assert.equal(entry.sourceId, "exp-1");
  assert.equal(entry.status, "posted");
  assertBalancedJournalLines(entry.lines);

  const listed = await store.listForWorkspace("ws-1", "u-peer");
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, entry.id);

  const balances = computeBalancesFromJournal(listed);
  assert.ok(balances.length >= 1);
});

test("ledger service forbids non-members", async () => {
  const ledger = new MemoryLedgerStore();
  const iam = new MemoryIamStore();
  const service = new LedgerService(ledger, iam);
  const owner = await iam.createWorkspace({
    actorUserId: "owner-1",
    name: "G",
    slug: "g-ledger",
    template: "friends_family",
  });

  await assert.rejects(
    () =>
      service.list(
        {
          userId: "stranger",
          displayName: "X",
          externalSubject: "local:stranger",
          authMode: "password",
        },
        owner.id,
      ),
    (err: unknown) => (err as { getStatus?: () => number }).getStatus?.() === 403,
  );

  const rows = await service.list(
    {
      userId: "owner-1",
      displayName: "Owner",
      externalSubject: "local:owner-1",
      authMode: "password",
    },
    owner.id,
  );
  assert.deepEqual(rows, []);
});

test("ledger rejects posting non-posted expense", async () => {
  const store = new MemoryLedgerStore();
  await assert.rejects(
    () =>
      store.postExpense("u1", {
        ...postedExpense({ id: "e2", workspaceId: "ws" }),
        status: "draft",
      }),
    /LEDGER_EXPENSE_STATUS/,
  );
});
