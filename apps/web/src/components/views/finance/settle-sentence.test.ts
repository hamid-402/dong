import { describe, expect, it } from "vitest";
import { formatMoneyWithUnit } from "@dang/ui";
import { settleConfirmRequest, settleHumanSentence, settleSuccessMessage } from "./settle-sentence";

describe("settle sentence", () => {
  it("names the other person and keeps the amount in Persian digits", () => {
    const amountLabel = formatMoneyWithUnit(2_500_000, "toman");
    expect(amountLabel).toMatch(/[۰-۹]/);
    expect(amountLabel).not.toMatch(/[0-9]/);
    const request = settleConfirmRequest({
      counterpartyName: "علی",
      intent: "settle_only",
      amountLabel,
    });
    expect(request.amount).toBe(amountLabel);
    expect(request.description).toContain("علی");
    expect(request.description).toContain("می‌پردازید");
    expect(settleHumanSentence({ counterpartyName: "علی", intent: "fund_gift_only" })).toContain(
      "هدیه",
    );
  });

  it("puts the same amount on the success toast", () => {
    const amountLabel = formatMoneyWithUnit(100_000, "toman");
    expect(settleSuccessMessage(amountLabel, { settlementAmountMinor: "100000", giftAmountMinor: "0" })).toContain(
      amountLabel,
    );
  });
});