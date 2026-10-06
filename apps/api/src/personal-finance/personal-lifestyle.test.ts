import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPersonalGoalsStore } from "./memory-personal-goals.store.js";
import { MemoryPersonalResourcesStore } from "./memory-personal-resources.store.js";
import { PersonalFinanceService } from "./personal-finance.service.js";

function stubService() {
  const goals = new MemoryPersonalGoalsStore();
  const resources = new MemoryPersonalResourcesStore();
  const iam = {
    listWorkspacesForUser: async () => [],
    ensurePersonalWorkspace: async () => ({ id: "ws-personal", slug: "me" }),
  };
  const expenses = { persistence: "memory" as const, listForWorkspace: async () => [] };
  const ledger = { persistence: "memory" as const, balancesForWorkspace: async () => [] };
  const settlements = {
    persistence: "memory" as const,
    listForWorkspace: async () => [],
  };
  const notifications = { notify: async () => undefined };
  const service = new PersonalFinanceService(
    iam as never,
    expenses as never,
    ledger as never,
    settlements as never,
    resources,
    goals,
    notifications as never,
  );
  return { service, goals, resources };
}

const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  externalSubject: "dev",
  displayName: "حمید",
  authMode: "dev" as const,
};

test("allocation plan defaults then persists", async () => {
  const { service } = stubService();
  const def = await service.getAllocationPlan(actor);
  assert.equal(def.percents.savings, 30);
  const put = await service.putAllocationPlan(actor, {
    percents: { solo: 20, group: 20, building: 10, org: 10, savings: 40 },
  });
  assert.equal(put.percents.savings, 40);
  const again = await service.getAllocationPlan(actor);
  assert.equal(again.percents.savings, 40);
});

test("paycheck creates income txn and lifestyle snapshot", async () => {
  const { service } = stubService();
  // 1405-06 ≈ 2026-08-23 .. 2026-09-22
  const paycheck = await service.createPaycheck(actor, {
    amountMinor: "10000000",
    occurredOn: "2026-09-01",
    note: "حقوق شهریور",
    idempotencyKey: "pc-1",
  });
  assert.equal(paycheck.yearMonth, "1405-06");
  assert.ok(paycheck.moneyTxnId);

  const snap = await service.lifestyleSnapshot(actor, { yearMonth: "1405-06" });
  assert.equal(snap.paycheckCount, 1);
  assert.equal(BigInt(snap.incomeTotal.amountMinor), 10_000_000n);
  assert.ok(snap.emptyReason === undefined || snap.lifestyleSpendTotal);
});

test("annual statement returns csv body", async () => {
  const { service } = stubService();
  await service.createPaycheck(actor, {
    amountMinor: "5000000",
    occurredOn: "2026-04-01",
    idempotencyKey: "pc-annual",
  });
  const result = await service.createAnnualStatement(actor, {
    jalaliYear: 1405,
    format: "csv",
  });
  assert.equal(result.format, "csv");
  assert.match(result.body, /سال شمسی,1405/);
});
