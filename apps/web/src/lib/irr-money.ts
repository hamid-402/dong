import type { Money } from "@dang/contracts";

/** Canonical UI money: IRR minor only (تومان × ۱۰). Rejects non-IRR / empty. */
export function tomanInputToIrrMinor(toman: string): Money | null {
  const n = Number(String(toman).replaceAll(",", "").replaceAll("/", "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return { amountMinor: String(Math.round(n) * 10), currency: "IRR" };
}

/** Display IRR minor as تومان integer string for inputs/labels. */
export function irrMinorToTomanInput(amountMinor: string): string {
  try {
    const minor = BigInt(amountMinor);
    if (minor <= 0n) return "";
    return (minor / 10n).toString();
  } catch {
    return "";
  }
}

export function assertIrrMoney(money: Money | null | undefined): money is Money {
  return Boolean(
    money &&
      money.currency === "IRR" &&
      /^\d+$/.test(money.amountMinor) &&
      BigInt(money.amountMinor) > 0n,
  );
}
