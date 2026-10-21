import assert from "node:assert/strict";
import test from "node:test";
import {
  MONEY_INTENT_KINDS,
  assertMoneyIntentPayload,
  evaluateActiveMoneyIntents,
  evaluateMoneyIntent,
  moneyIntentMeta,
  type MoneyIntentEvalContext,
  type MoneyIntentKind,
  type MoneyIntentSummary,
} from "../src/money-intent.js";

const ctx: MoneyIntentEvalContext = {
  incomeMinor: 10000n,
  expenseMinor: 6000n,
  netMinor: 4000n,
  liquidMinor: 2500n,
  openSettleMinor: 900n,
  installmentMinor: 700n,
  investmentMinor: 300n,
  goals: [
    {
      id: "g1",
      name: "Car",
      progressPercent: 40,
      target: { amountMinor: "1000", currency: "IRR" },
      contributed: { amountMinor: "400", currency: "IRR" },
    },
  ],
};

const intent = (
  kind: MoneyIntentKind,
  extra: Partial<MoneyIntentSummary> = {},
): MoneyIntentSummary => ({
  id: `i-${kind}`,
  name: kind,
  kind,
  period: "month",
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...extra,
});

test("moneyIntentMeta throws for unknown kind and resolves every known kind", () => {
  assert.throws(() => moneyIntentMeta("nope" as MoneyIntentKind), /unknown_money_intent_kind:nope/);
  for (const k of MONEY_INTENT_KINDS) assert.equal(moneyIntentMeta(k).kind, k);
});

test("assertMoneyIntentPayload validates name, amount, percent and goal", () => {
  assert.throws(
    () => assertMoneyIntentPayload({ kind: "spend_cap_amount", name: "  ", targetMinor: "5" }),
    /INTENT_NAME/,
  );
  for (const bad of [undefined, null, "abc", "-5", "0", "1.5"]) {
    assert.throws(
      () => assertMoneyIntentPayload({ kind: "spend_cap_amount", name: "x", targetMinor: bad }),
      /INTENT_AMOUNT/,
      String(bad),
    );
  }
  for (const bad of [undefined, null, 0, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => assertMoneyIntentPayload({ kind: "save_income_percent", name: "x", targetPercent: bad }),
      /INTENT_PERCENT/,
      String(bad),
    );
  }
  assert.throws(
    () => assertMoneyIntentPayload({ kind: "savings_goal_link", name: "x", targetPercent: 50, goalId: " " }),
    /INTENT_GOAL/,
  );
  assert.doesNotThrow(() =>
    assertMoneyIntentPayload({ kind: "savings_goal_link", name: "x", targetPercent: 50, goalId: "g1" }),
  );
  assert.doesNotThrow(() => assertMoneyIntentPayload({ kind: "investment_floor", name: "x", targetMinor: "1" }));
});

test("save_income_percent: met, unmet with gap, and no-income", () => {
  const met = evaluateMoneyIntent(intent("save_income_percent", { targetPercent: 40 }), ctx);
  assert.equal(met.met, true);
  assert.equal(met.actualLabel, "40٪");
  assert.equal(met.progressPercent, 100);
  assert.equal(met.gapMinor, undefined);
  assert.equal(met.hrefHint, "me-finance");

  const unmet = evaluateMoneyIntent(intent("save_income_percent", { targetPercent: 50 }), ctx);
  assert.equal(unmet.met, false);
  assert.equal(unmet.gapMinor, "1000");
  assert.equal(unmet.progressPercent, 80);

  const negNet = evaluateMoneyIntent(intent("save_income_percent", { targetPercent: 10 }), {
    ...ctx,
    netMinor: -500n,
  });
  assert.equal(negNet.met, false);
  assert.equal(negNet.gapMinor, "1000");

  const none = evaluateMoneyIntent(intent("save_income_percent", { targetPercent: 10 }), {
    ...ctx,
    incomeMinor: 0n,
  });
  assert.equal(none.met, null);
  assert.equal(none.progressPercent, null);
});

test("spend_cap_amount reports over/under cap and gap", () => {
  const over = evaluateMoneyIntent(intent("spend_cap_amount", { targetMinor: "5000" }), ctx);
  assert.equal(over.met, false);
  assert.equal(over.gapMinor, "1000");
  assert.equal(over.progressPercent, 120);
  assert.equal(over.targetLabel.includes("5000"), true);
  assert.equal(over.actualLabel, "6000");

  const ok = evaluateMoneyIntent(intent("spend_cap_amount", { targetMinor: "6000" }), ctx);
  assert.equal(ok.met, true);
  assert.equal(ok.gapMinor, undefined);

  const zeroCap = evaluateMoneyIntent(intent("spend_cap_amount"), ctx);
  assert.equal(zeroCap.progressPercent, null);
  assert.equal(zeroCap.met, false);
});

test("spend_cap_income_percent handles ratio and no-income", () => {
  const ok = evaluateMoneyIntent(intent("spend_cap_income_percent", { targetPercent: 70 }), ctx);
  assert.equal(ok.met, true);
  assert.equal(ok.actualLabel, "60٪");
  const bad = evaluateMoneyIntent(intent("spend_cap_income_percent", { targetPercent: 50 }), ctx);
  assert.equal(bad.met, false);
  assert.equal(bad.progressPercent, 120);
  const none = evaluateMoneyIntent(intent("spend_cap_income_percent", { targetPercent: 50 }), {
    ...ctx,
    incomeMinor: 0n,
  });
  assert.equal(none.met, null);
});

test("debt_open_cap, installment_pay_cap compare against their own metric", () => {
  const debt = evaluateMoneyIntent(intent("debt_open_cap", { targetMinor: "500" }), ctx);
  assert.equal(debt.met, false);
  assert.equal(debt.gapMinor, "400");
  assert.equal(debt.hrefHint, "settlements");
  assert.equal(evaluateMoneyIntent(intent("debt_open_cap", { targetMinor: "900" }), ctx).met, true);

  const inst = evaluateMoneyIntent(intent("installment_pay_cap", { targetMinor: "1000" }), ctx);
  assert.equal(inst.met, true);
  assert.equal(inst.progressPercent, 70);
  const instOver = evaluateMoneyIntent(intent("installment_pay_cap", { targetMinor: "500" }), ctx);
  assert.equal(instOver.gapMinor, "200");
  assert.equal(evaluateMoneyIntent(intent("installment_pay_cap"), ctx).progressPercent, null);
});

test("liquid_floor, net_floor, investment_floor compare lower bounds", () => {
  const liquid = evaluateMoneyIntent(intent("liquid_floor", { targetMinor: "5000" }), ctx);
  assert.equal(liquid.met, false);
  assert.equal(liquid.gapMinor, "2500");
  assert.equal(liquid.progressPercent, 50);
  assert.equal(evaluateMoneyIntent(intent("liquid_floor", { targetMinor: "2500" }), ctx).met, true);
  assert.equal(evaluateMoneyIntent(intent("liquid_floor"), ctx).progressPercent, null);

  const net = evaluateMoneyIntent(intent("net_floor", { targetMinor: "4000" }), ctx);
  assert.equal(net.met, true);
  assert.equal(net.hrefHint, "charts");
  assert.equal(evaluateMoneyIntent(intent("net_floor", { targetMinor: "9000" }), ctx).gapMinor, "5000");
  assert.equal(evaluateMoneyIntent(intent("net_floor"), ctx).progressPercent, null);

  const inv = evaluateMoneyIntent(intent("investment_floor", { targetMinor: "1000" }), ctx);
  assert.equal(inv.met, false);
  assert.equal(inv.gapMinor, "700");
  assert.equal(evaluateMoneyIntent(intent("investment_floor", { targetMinor: "300" }), ctx).met, true);
  assert.equal(evaluateMoneyIntent(intent("investment_floor"), ctx).progressPercent, null);
});

test("savings_goal_link judges linked goal progress and missing goal", () => {
  const met = evaluateMoneyIntent(intent("savings_goal_link", { goalId: "g1", targetPercent: 30 }), ctx);
  assert.equal(met.met, true);
  assert.equal(met.actualLabel.includes("Car"), true);
  const unmet = evaluateMoneyIntent(intent("savings_goal_link", { goalId: "g1", targetPercent: 80 }), ctx);
  assert.equal(unmet.met, false);
  assert.equal(unmet.progressPercent, 50);
  const missing = evaluateMoneyIntent(intent("savings_goal_link", { goalId: "zzz", targetPercent: 80 }), ctx);
  assert.equal(missing.met, null);
  assert.equal(missing.progressPercent, null);
});

test("evaluateActiveMoneyIntents skips inactive intents", () => {
  const list = [
    intent("spend_cap_amount", { id: "a", targetMinor: "9000" }),
    intent("net_floor", { id: "b", targetMinor: "1", active: false }),
  ];
  const out = evaluateActiveMoneyIntents(list, ctx);
  assert.deepEqual(out.map((e) => e.intentId), ["a"]);
});
