import type { BalanceLine } from "./finance.js";
import type { Money } from "./money.js";

/** How a member payment should be applied (S12 settle-pay). */
export type SettlePayIntent =
  /** Entire amount is a settlement transfer (may create/increase credit). */
  | "settle_only"
  /** Clear debt (up to suggested) via settlement; remainder is gift to petty cash. */
  | "settle_and_fund_gift"
  /** Entire amount is a gift to petty cash (no member debt created for others). */
  | "fund_gift_only";

export type SettlePayPlan = {
  intent: SettlePayIntent;
  /** IRR minor the payer is transferring in this action. */
  payAmountMinor: string;
  /** Portion posted as member↔member settlement (0 if none). */
  settlementAmountMinor: string;
  /** Portion posted as fund gift/topup without shared expense (0 if none). */
  giftAmountMinor: string;
  /** Suggested pairwise clear amount before this pay (0 if none). */
  suggestedSettleMinor: string;
  /**
   * Estimated payer net after applying settlementAmount only
   * (gift does not change member nets).
   */
  payerNetAfterSettlementMinor: string;
};

/**
 * Pairwise suggestion: when payer is debtor (net&lt;0) and counterparty is creditor
 * (net&gt;0), suggest min(|payer|, counterparty).
 */
export function suggestedPairwiseSettleMinor(
  payerNetMinor: string | number | bigint,
  counterpartyNetMinor: string | number | bigint,
): bigint {
  const payer = BigInt(payerNetMinor);
  const counterparty = BigInt(counterpartyNetMinor);
  if (payer >= 0n || counterparty <= 0n) return 0n;
  const need = -payer;
  return need < counterparty ? need : counterparty;
}

export function netForUser(
  lines: readonly BalanceLine[],
  userId: string,
): bigint {
  const line = lines.find((l) => l.userId === userId);
  return BigInt(line?.net.amountMinor ?? "0");
}

/**
 * Plan how a payment splits between settlement and fund gift.
 * Gift never creates shared member debt; settlement is double-entry between two members.
 */
export function planSettlePay(input: {
  intent: SettlePayIntent;
  payAmountMinor: string;
  payerNetMinor: string;
  counterpartyNetMinor: string;
}): SettlePayPlan {
  const pay = BigInt(input.payAmountMinor);
  if (pay <= 0n) {
    throw new Error("PAY_AMOUNT_NON_POSITIVE");
  }
  const suggested = suggestedPairwiseSettleMinor(
    input.payerNetMinor,
    input.counterpartyNetMinor,
  );
  const payerNet = BigInt(input.payerNetMinor);

  if (input.intent === "fund_gift_only") {
    return {
      intent: input.intent,
      payAmountMinor: pay.toString(),
      settlementAmountMinor: "0",
      giftAmountMinor: pay.toString(),
      suggestedSettleMinor: suggested.toString(),
      payerNetAfterSettlementMinor: payerNet.toString(),
    };
  }

  if (input.intent === "settle_only") {
    return {
      intent: input.intent,
      payAmountMinor: pay.toString(),
      settlementAmountMinor: pay.toString(),
      giftAmountMinor: "0",
      suggestedSettleMinor: suggested.toString(),
      payerNetAfterSettlementMinor: (payerNet + pay).toString(),
    };
  }

  // settle_and_fund_gift: settle up to suggested (or pay if smaller); rest gifts fund
  const settle = pay <= suggested ? pay : suggested;
  const gift = pay - settle;
  return {
    intent: input.intent,
    payAmountMinor: pay.toString(),
    settlementAmountMinor: settle.toString(),
    giftAmountMinor: gift.toString(),
    suggestedSettleMinor: suggested.toString(),
    payerNetAfterSettlementMinor: (payerNet + settle).toString(),
  };
}

export function moneyIrr(amountMinor: string): Money {
  return { amountMinor, currency: "IRR" };
}

/** True when intent may post a fund gift. */
export function settlePayIntentNeedsFund(intent: SettlePayIntent): boolean {
  return intent === "settle_and_fund_gift" || intent === "fund_gift_only";
}
