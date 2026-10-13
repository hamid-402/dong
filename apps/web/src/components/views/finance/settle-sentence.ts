import type { SettlePayIntent } from "@dang/contracts";
import type { ConfirmRequest } from "@dang/ui";

export function settleHumanSentence(input: {
  counterpartyName: string;
  intent: SettlePayIntent;
}): string {
  const who = input.counterpartyName.trim() || "طرف مقابل";
  if (input.intent === "fund_gift_only") {
    return `این مبلغ هدیه به صندوق است و برای ${who} بدهی نمی‌سازد.`;
  }
  if (input.intent === "settle_and_fund_gift") {
    return `تا سقف بدهی به ${who} تسویه می‌شود و مازاد هدیهٔ صندوق است.`;
  }
  return `شما این مبلغ را به ${who} می‌پردازید.`;
}

export function settleConfirmRequest(input: {
  counterpartyName: string;
  intent: SettlePayIntent;
  amountLabel: string;
}): ConfirmRequest {
  return {
    title: "ثبت تسویه",
    description: settleHumanSentence(input),
    amount: input.amountLabel,
    confirmLabel: "ثبت تسویه",
    cancelLabel: "انصراف",
    tone: "default",
  };
}

export function settleSuccessMessage(
  amountLabel: string,
  plan: { settlementAmountMinor: string; giftAmountMinor: string },
): string {
  const settlePart = BigInt(plan.settlementAmountMinor);
  const giftPart = BigInt(plan.giftAmountMinor);
  if (settlePart > 0n && giftPart > 0n) {
    return `تسویه ${amountLabel} ثبت شد و مازاد به صندوق هدیه شد`;
  }
  if (giftPart > 0n) {
    return `هدیه ${amountLabel} به صندوق ثبت شد`;
  }
  return `تسویه ${amountLabel} ثبت شد — منتظر تأیید طرف مقابل`;
}
