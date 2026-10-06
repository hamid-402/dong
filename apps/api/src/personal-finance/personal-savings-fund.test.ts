import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPersonalGoalsStore } from "./memory-personal-goals.store.js";
import { PersonalFinanceService } from "./personal-finance.service.js";
import type { IamStore } from "../iam/iam.types.js";
import type { ExpenseStore } from "../expenses/expense.types.js";
import type { LedgerStore } from "../ledger/ledger.types.js";
import type { SettlementStore } from "../settlements/settlement.types.js";
import type { PersonalResourcesStore } from "./personal-resources.types.js";
import type { NotificationsService } from "../notifications/notifications.service.js";

const actor = {
  userId: "user-savings-1",
  externalSubject: "sav",
  displayName: "Saver",
  authMode: "password" as const,
};

function buildService() {
  const goals = new MemoryPersonalGoalsStore();
  const resources = {
    createTxn: async () => {
      throw new Error("unexpected txn");
    },
    listTxns: async () => [],
  } as unknown as PersonalResourcesStore;
  const service = new PersonalFinanceService(
    { listWorkspacesForUser: async () => [] } as unknown as IamStore,
    { listForWorkspace: async () => [] } as unknown as ExpenseStore,
    {} as unknown as LedgerStore,
    {} as unknown as SettlementStore,
    resources,
    goals,
    { notify: async () => undefined } as unknown as NotificationsService,
  );
  return { service, goals };
}

test("personal savings fund: ensure-default + deposit updates live balance", async () => {
  const { service } = buildService();
  const empty = await service.getSavingsFundSummary(actor);
  assert.equal(empty.balanceMinor, "0");
  assert.equal(empty.goalCount, 0);
  assert.equal(empty.defaultGoal, null);

  const ensured = await service.ensureDefaultSavingsFund(actor, {
    idempotencyKey: "sav-ensure-1",
  });
  assert.equal(ensured.created, true);
  assert.equal(ensured.fund.defaultGoal?.name, "صندوق پس‌انداز");
  assert.equal(ensured.fund.goalCount, 1);

  const again = await service.ensureDefaultSavingsFund(actor, {
    idempotencyKey: "sav-ensure-2",
  });
  assert.equal(again.created, false);
  assert.equal(again.fund.defaultGoal?.id, ensured.fund.defaultGoal?.id);

  const deposit = await service.depositToSavingsFund(actor, {
    amountMinor: "500000",
    note: "واریز ماهانه",
    idempotencyKey: "sav-dep-1",
  });
  assert.equal(deposit.fund.balanceMinor, "500000");
  assert.equal(deposit.goal.contributed.amountMinor, "500000");

  const second = await service.depositToSavingsFund(actor, {
    amountMinor: "250000",
    idempotencyKey: "sav-dep-2",
  });
  assert.equal(second.fund.balanceMinor, "750000");
});
