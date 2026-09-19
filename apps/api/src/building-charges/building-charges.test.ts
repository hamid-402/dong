import assert from "node:assert/strict";
import test from "node:test";
import type { AuthActor } from "@dang/contracts";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";
import { MemoryIamStore } from "../iam/memory-iam.store.js";
import { MemoryLedgerStore } from "../ledger/memory-ledger.store.js";
import { MemoryWorkspaceSubunitStore } from "../subunits/memory-subunit.store.js";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import { ExpensesService } from "../expenses/expenses.service.js";
import { BuildingChargesService } from "./building-charges.service.js";

const idempotency = {
  run: async <T>(_scope: string, _user: string, _key: string, work: () => Promise<T>) =>
    work(),
};

function actorOf(row: { userId: string; externalSubject: string; displayName: string }): AuthActor {
  return {
    userId: row.userId,
    externalSubject: row.externalSubject,
    displayName: row.displayName,
    authMode: "dev",
  };
}

function buildExpensesService(expenses: MemoryExpenseStore, iam: MemoryIamStore) {
  return new ExpensesService(
    expenses,
    {
      get: async () => ({
        approvalThresholdMinor: null,
        requireReceiptAboveMinor: null,
      }),
    } as never,
    new MemoryLedgerStore(),
    iam as never,
    {
      requireAccess: async () => ({ role: "owner", decision: { allowed: true } }),
      requireMember: async () => undefined,
      assertNotReadOnly: () => undefined,
    } as never,
    new MemoryAuditStore(),
    { applyCompanyExpenseSpend: async () => null } as never,
    idempotency as never,
    { insert: async () => ({ id: "o1" }) } as never,
    { correlation: () => ({}), dispatch: async () => undefined } as never,
    { listForTarget: async () => [] } as never,
    {
      approve: async () => undefined,
      pending: async () => [],
      createFirst: async () => undefined,
    } as never,
    {
      assertFourEyes: async () => undefined,
      applyTierGate: async () => ({ outcome: "bypass" }),
      resolveThresholdMinor: async () => null,
    } as never,
    { recordUsage: async () => undefined } as never,
  );
}

async function seedBuilding(iam: MemoryIamStore) {
  const owner = await iam.upsertDevActor({
    externalSubject: `owner-${crypto.randomUUID()}@test`,
    displayName: "Owner",
  });
  const workspace = await iam.createWorkspace({
    actorUserId: owner.userId,
    name: "Tower",
    slug: `tower-${crypto.randomUUID().slice(0, 8)}`,
    template: "residential_building",
  });
  return { owner, workspace };
}

test("building charge generate is idempotent per subunit/month", async () => {
  const iam = new MemoryIamStore();
  const subunits = new MemoryWorkspaceSubunitStore();
  const expenses = new MemoryExpenseStore();
  const { owner, workspace } = await seedBuilding(iam);

  const unit = await subunits.create(workspace.id, owner.userId, {
    kind: "unit",
    code: "A1",
    name: "Unit A1",
  });
  await subunits.update(workspace.id, unit.id, owner.userId, {
    memberUserIds: [owner.userId],
  });

  const expensesService = buildExpensesService(expenses, iam);
  const service = new BuildingChargesService(
    iam,
    subunits,
    expensesService,
    expenses,
  );

  const body = {
    yearMonth: "2026-03",
    amountMinorPerUnit: "500000",
    idempotencyKey: "run-1",
  };

  const first = await service.generateMonthly(actorOf(owner), workspace.id, body);
  assert.equal(first.created.length, 1);
  assert.equal(first.skipped.length, 0);

  const second = await service.generateMonthly(actorOf(owner), workspace.id, body);
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(second.skipped[0]?.reason, "already_generated");
  assert.equal(second.skipped[0]?.expenseId, first.created[0]?.expenseId);
});
