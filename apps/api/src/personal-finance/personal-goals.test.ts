import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMonthlyCloseTotals,
  computeSavingsGoalProgress,
  enrichSavingsGoalSummary,
  isSpendingAlertBreached,
  shouldNotifySpendingAlert,
} from "@dang/contracts";
import { MemoryPersonalGoalsStore } from "./memory-personal-goals.store.js";

test("S11-10 savings progress comes only from contributions", async () => {
  const store = new MemoryPersonalGoalsStore();
  const userId = "u-goals";
  const goal = await store.createSavingsGoal(userId, {
    name: "سفر",
    targetMinor: "1000000",
    idempotencyKey: "g1",
  });
  assert.equal(goal.contributed.amountMinor, "0");
  assert.equal(goal.progressPercent, 0);
  assert.equal(goal.status, "active");

  const { goal: after } = await store.addContribution(userId, goal.id, {
    amountMinor: "250000",
    occurredAt: "2026-09-01T10:00:00.000Z",
    idempotencyKey: "c1",
  });
  assert.equal(after.contributed.amountMinor, "250000");
  assert.equal(after.progressPercent, 25);

  const progress = computeSavingsGoalProgress({
    targetMinor: 1_000_000n,
    contributionAmountMinors: [250_000n, 750_000n],
  });
  assert.equal(progress.contributedMinor, 1_000_000n);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.reached, true);

  const withLedger = computeSavingsGoalProgress({
    targetMinor: 1_000_000n,
    contributionAmountMinors: [100_000n],
    ledgerDepositMinors: [400_000n],
  });
  assert.equal(withLedger.contributedMinor, 500_000n);
  assert.equal(withLedger.progressPercent, 50);

  const reached = enrichSavingsGoalSummary({
    id: goal.id,
    name: "سفر",
    targetMinor: 1_000_000n,
    contributionAmountMinors: [250_000n, 750_000n],
    status: "active",
    createdAt: goal.createdAt,
  });
  assert.equal(reached.status, "reached");
  assert.equal(reached.progressPercent, 100);
});

test("S11-10 monthly close empty=true when no txns/share", () => {
  const empty = computeMonthlyCloseTotals({
    incomeMinor: 0n,
    personalExpenseMinor: 0n,
    groupShareMinor: 0n,
  });
  assert.equal(empty.empty, true);
  assert.equal(empty.expenseMinor, 0n);
  assert.equal(empty.savedMinor, 0n);

  const filled = computeMonthlyCloseTotals({
    incomeMinor: 1_000_000n,
    personalExpenseMinor: 200_000n,
    groupShareMinor: 100_000n,
  });
  assert.equal(filled.empty, false);
  assert.equal(filled.expenseMinor, 300_000n);
  assert.equal(filled.savedMinor, 700_000n);
});

test("S11-10 monthly close store upsert marks empty from zeros", async () => {
  const store = new MemoryPersonalGoalsStore();
  const close = await store.upsertMonthlyClose("u1", {
    yearMonth: "2026-09",
    incomeMinor: 0n,
    expenseMinor: 0n,
    groupShareMinor: 0n,
    personalMinor: 0n,
    savedMinor: 0n,
    empty: true,
    emptyReason: "برای این ماه تراکنش یا سهم گروهی ثبت نشده است",
  });
  assert.equal(close.empty, true);
  assert.ok(close.emptyReason);
  const loaded = await store.getMonthlyClose("u1", "2026-09");
  assert.equal(loaded?.empty, true);
});

test("S11-10 spending alert triggers only over threshold", () => {
  assert.equal(
    isSpendingAlertBreached({
      spentMinor: 79_999n,
      limitMinor: 100_000n,
      thresholdPercent: 80,
    }),
    false,
  );
  assert.equal(
    isSpendingAlertBreached({
      spentMinor: 80_000n,
      limitMinor: 100_000n,
      thresholdPercent: 80,
    }),
    true,
  );
  assert.equal(
    isSpendingAlertBreached({
      spentMinor: 0n,
      limitMinor: 100_000n,
      thresholdPercent: 80,
    }),
    false,
  );
  assert.equal(
    shouldNotifySpendingAlert({
      breached: false,
      lastFiredAt: null,
      periodFrom: "2026-09-01",
    }),
    false,
  );
  assert.equal(
    shouldNotifySpendingAlert({
      breached: true,
      lastFiredAt: null,
      periodFrom: "2026-09-01",
    }),
    true,
  );
  assert.equal(
    shouldNotifySpendingAlert({
      breached: true,
      lastFiredAt: "2026-09-05T12:00:00.000Z",
      periodFrom: "2026-09-01",
    }),
    false,
  );
  assert.equal(
    shouldNotifySpendingAlert({
      breached: true,
      lastFiredAt: "2026-08-20T12:00:00.000Z",
      periodFrom: "2026-09-01",
    }),
    true,
  );
});

test("S11-10 markAlertFired persists lastFiredAt", async () => {
  const store = new MemoryPersonalGoalsStore();
  const [alert] = await store.putAlerts("u-alert", {
    alerts: [
      {
        scope: "total",
        limitMinor: "100000",
        thresholdPercent: 80,
      },
    ],
  });
  assert.ok(alert);
  assert.equal(alert.lastFiredAt, undefined);
  const fired = await store.markAlertFired("u-alert", alert.id, "2026-09-10T08:00:00.000Z");
  assert.equal(fired?.lastFiredAt, "2026-09-10T08:00:00.000Z");
  const listed = await store.listAlerts("u-alert");
  assert.equal(listed[0]?.lastFiredAt, "2026-09-10T08:00:00.000Z");
});
