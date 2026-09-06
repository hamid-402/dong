/**
 * Integration-style money path: expense draft → post → journal → balances.
 * Uses in-memory stores (no Docker). Complements DB/RLS tests in @dang/db.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateExpenseSplit,
  buildExpenseJournalLines,
  computeBalancesFromJournal,
  computeProvisionalBalances,
} from "@dang/contracts";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";

test("expense → journal → balances stay consistent (memory path)", async () => {
  const expenses = new MemoryExpenseStore();
  const ledger = new MemoryLedgerStore();

  const draft = await expenses.createDraft("alice", {
    workspaceId: "ws1",
    title: "ناهار",
    total: { amountMinor: "10000", currency: "IRR" },
    paidByUserId: "alice",
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
    occurredOn: "2026-09-01",
    idempotencyKey: "int-1",
  });

  const submitted = await expenses.submit("ws1", draft.id, "alice");
  const posted = await expenses.post("ws1", submitted.id, "alice");
  assert.equal(posted.status, "posted");

  const entry = await ledger.postExpense("alice", posted);
  assert.equal(entry.lines.length >= 2, true);

  const expectedLines = buildExpenseJournalLines(posted);
  const debit = expectedLines
    .filter((l) => l.side === "debit")
    .reduce((a, l) => a + BigInt(l.amount.amountMinor), 0n);
  const credit = expectedLines
    .filter((l) => l.side === "credit")
    .reduce((a, l) => a + BigInt(l.amount.amountMinor), 0n);
  assert.equal(debit, credit);

  const provisional = computeProvisionalBalances(
    [
      {
        id: posted.id,
        paidByUserId: posted.paidByUserId,
        paymentLines: posted.paymentLines,
        total: posted.total,
        splits: posted.splits,
        status: "posted",
      },
    ],
    [],
  );
  const fromJournal = computeBalancesFromJournal([
    {
      status: "posted",
      lines: entry.lines,
    },
  ]);

  const bobProv = provisional.find((l) => l.userId === "bob");
  const bobJr = fromJournal.find((l) => l.userId === "bob");
  assert.ok(bobProv);
  assert.ok(bobJr);
  assert.equal(bobProv.net.amountMinor, bobJr.net.amountMinor);

  const splits = allocateExpenseSplit({
    total: posted.total,
    splitMethod: "equal",
    participantUserIds: ["alice", "bob"],
  });
  assert.equal(splits.length, 2);
});
