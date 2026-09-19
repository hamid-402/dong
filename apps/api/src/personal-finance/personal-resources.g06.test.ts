import assert from "node:assert/strict";
import test from "node:test";
import {
  currentJalaliYearMonth,
  jalaliYearMonthDateBounds,
  jalaliYearMonthFromIsoDate,
  isJalaliYearMonthKey,
} from "@dang/contracts";
import { MemoryPersonalResourcesStore } from "./memory-personal-resources.store.js";

test("G06 transfer updates both account balances", async () => {
  const store = new MemoryPersonalResourcesStore();
  const userId = "u-xfer";
  const cash = await store.createAccount(userId, {
    name: "نقد",
    kind: "cash",
    openingBalance: { amountMinor: "1000000", currency: "IRR" },
    idempotencyKey: "cash-1",
  });
  const bank = await store.createAccount(userId, {
    name: "بانک",
    kind: "bank",
    openingBalance: { amountMinor: "0", currency: "IRR" },
    idempotencyKey: "bank-1",
  });
  const { out, in: inn } = await store.createTransfer(userId, {
    fromAccountId: cash.id,
    toAccountId: bank.id,
    amount: { amountMinor: "250000", currency: "IRR" },
    occurredOn: "2026-09-19",
    idempotencyKey: "xfer-1",
  });
  assert.equal(out.kind, "transfer_out");
  assert.equal(inn.kind, "transfer_in");
  const accounts = await store.listAccounts(userId);
  const cashBal = accounts.find((a) => a.id === cash.id)!;
  const bankBal = accounts.find((a) => a.id === bank.id)!;
  assert.equal(cashBal.balance.amountMinor, "750000");
  assert.equal(bankBal.balance.amountMinor, "250000");
});

test("G06 Jalali budget spent rolls up by Jalali month", async () => {
  assert.equal(isJalaliYearMonthKey("1405-06"), true);
  assert.equal(isJalaliYearMonthKey("2026-09"), false);
  const jym = jalaliYearMonthFromIsoDate("2026-09-19");
  assert.ok(jym);
  assert.match(jym!, /^\d{4}-\d{2}$/);
  const bounds = jalaliYearMonthDateBounds(jym!);
  assert.ok(bounds.from <= "2026-09-19" && bounds.to >= "2026-09-19");

  const store = new MemoryPersonalResourcesStore();
  const userId = "u-budget";
  const account = await store.createAccount(userId, {
    name: "کارت",
    kind: "card",
    openingBalance: { amountMinor: "0", currency: "IRR" },
    idempotencyKey: "card-1",
  });
  await store.createTxn(userId, {
    accountId: account.id,
    kind: "expense",
    amount: { amountMinor: "300000", currency: "IRR" },
    occurredOn: "2026-09-19",
    idempotencyKey: "exp-jalali",
  });
  const budget = await store.upsertBudget(userId, {
    yearMonth: jym!,
    limit: { amountMinor: "1000000", currency: "IRR" },
    idempotencyKey: "bud-1",
  });
  assert.equal(budget.spent.amountMinor, "300000");
  assert.equal(budget.yearMonth, jym);
  assert.ok(currentJalaliYearMonth().length === 7);
});
