import type { DisplayUnit, Money } from "@dang/contracts";
import { displayIntegerToIrrMinor, irrMinorToDisplayInteger } from "@dang/contracts";

/**
 * Parse a display-unit integer string into IRR minor Money.
 * `unit` must match what the user typed (profile/workspace preference).
 */
export function displayInputToIrrMinor(
  raw: string,
  unit: DisplayUnit,
): Money | null {
  const n = Number(String(raw).replaceAll(",", "").replaceAll("/", "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return {
      amountMinor: displayIntegerToIrrMinor(Math.round(n), unit),
      currency: "IRR",
    };
  } catch {
    return null;
  }
}

/** Display IRR minor as an integer string in the chosen unit (for inputs). */
export function irrMinorToDisplayInput(
  amountMinor: string,
  unit: DisplayUnit,
): string {
  try {
    const value = irrMinorToDisplayInteger(amountMinor, unit);
    if (value <= 0n) return "";
    return value.toString();
  } catch {
    return "";
  }
}

/**
 * @deprecated Prefer displayInputToIrrMinor(raw, unit). Kept for legacy toman-only forms.
 */
export function tomanInputToIrrMinor(toman: string): Money | null {
  return displayInputToIrrMinor(toman, "toman");
}

/**
 * @deprecated Prefer irrMinorToDisplayInput(minor, unit).
 */
export function irrMinorToTomanInput(amountMinor: string): string {
  return irrMinorToDisplayInput(amountMinor, "toman");
}

export function assertIrrMoney(money: Money | null | undefined): money is Money {
  return Boolean(
    money &&
      money.currency === "IRR" &&
      /^\d+$/.test(money.amountMinor) &&
      BigInt(money.amountMinor) > 0n,
  );
}
