import type { Money } from "@dang/contracts";

/** Canonical UI money: IRR minor only (تومان × ۱۰). Rejects non-IRR / empty. */
export function tomanInputToIrrMinor(toman: string): Money | null {
  const n = Number(String(toman).replaceAll(",", "").replaceAll("/", "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return { amountMinor: String(Math.round(n) * 10), currency: "IRR" };
}

export function assertIrrMoney(money: Money | null | undefined): money is Money {
  return Boolean(
    money &&
      money.currency === "IRR" &&
      /^\d+$/.test(money.amountMinor) &&
      BigInt(money.amountMinor) > 0n,
  );
}
