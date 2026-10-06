import assert from "node:assert/strict";
import test from "node:test";
import {
  MONEY_INTENT_KIND_CATALOG,
  assertMoneyIntentPayload,
  evaluateMoneyIntent,
  moneyIntentMeta,
} from "../src/money-intent.js";

test("catalog covers every kind with field requirements", () => {
  assert.ok(MONEY_INTENT_KIND_CATALOG.length >= 5);
  for (const meta of MONEY_INTENT_KIND_CATALOG) {
    assert.equal(moneyIntentMeta(meta.kind).kind, meta.kind);
  }
});

test("assertMoneyIntentPayload enforces kind-specific fields", () => {
  assert.throws(
    () =>
      assertMoneyIntentPayload({
        kind: "save_income_percent",
        name: "x",
      }),
    /INTENT_PERCENT/,
  );
  assert.doesNotThrow(() =>
    assertMoneyIntentPayload({
      kind: "save_income_percent",
      name: "پس‌انداز",
      targetPercent: 15,
    }),
  );
  assert.throws(
    () =>
      assertMoneyIntentPayload({
        kind: "liquid_floor",
        name: "کف",
      }),
    /INTENT_AMOUNT/,
  );
});

test("evaluateMoneyIntent judges live metrics only", () => {
  const base = {
    id: "i1",
    name: "سقف خرج",
    kind: "spend_cap_amount" as const,
    period: "month" as const,
    targetMinor: "5000",
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const ctx = {
    incomeMinor: 10000n,
    expenseMinor: 6000n,
    netMinor: 4000n,
    liquidMinor: 1000n,
    openSettleMinor: 0n,
    installmentMinor: 0n,
    investmentMinor: 0n,
    goals: [],
  };
  const over = evaluateMoneyIntent(base, ctx);
  assert.equal(over.met, false);
  const under = evaluateMoneyIntent({ ...base, targetMinor: "8000" }, ctx);
  assert.equal(under.met, true);
});
