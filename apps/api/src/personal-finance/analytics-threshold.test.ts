import assert from "node:assert/strict";
import test from "node:test";
import { irrMoney } from "@dang/contracts";
import { MemoryExpenseStore } from "../expenses/memory-expense.store.js";
import type { IamStore } from "../iam/iam.types.js";
import type { LedgerStore } from "../ledger/ledger.types.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { SettlementStore } from "../settlements/settlement.types.js";
import { MemoryPersonalGoalsStore } from "./memory-personal-goals.store.js";
import { MemoryPersonalResourcesStore } from "./memory-personal-resources.store.js";
import { PersonalFinanceService } from "./personal-finance.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const personalWs = "22222222-2222-4222-8222-222222222222";

test("G07 runThresholdSweep fires spending alert once per period", async () => {
  const goals = new MemoryPersonalGoalsStore();
  const resources = new MemoryPersonalResourcesStore();
  await goals.putAlerts(userId, {
    alerts: [{ scope: "total", limitMinor: "100000", thresholdPercent: 80 }],
  });
  const account = await resources.createAccount(userId, {
    name: "نقد",
    kind: "cash",
    openingBalance: irrMoney(0n),
    idempotencyKey: "acc-th",
  });
  await resources.createTxn(userId, {
    accountId: account.id,
    kind: "expense",
    amount: irrMoney(85_000n),
    occurredOn: "2026-09-10",
    idempotencyKey: "txn-th",
  });

  let notifyCount = 0;
  const notifications = {
    notify: async () => {
      notifyCount += 1;
    },
  } as unknown as NotificationsService;

  const iam = {
    ensurePersonalWorkspace: async () => ({
      id: personalWs,
      slug: "me",
      name: "من",
      template: "personal" as const,
    }),
    listWorkspacesForUser: async () => [],
  } as unknown as IamStore;

  const service = new PersonalFinanceService(
    iam,
    new MemoryExpenseStore(),
    { persistence: "memory" } as LedgerStore,
    { persistence: "memory" } as SettlementStore,
    resources,
    goals,
    notifications,
  );

  const first = await service.runThresholdSweep(userId, "2026-09-10");
  assert.equal(first.fired, 1);
  assert.equal(notifyCount, 1);

  const second = await service.runThresholdSweep(userId, "2026-09-11");
  assert.equal(second.fired, 0);
  assert.equal(notifyCount, 1);
});
