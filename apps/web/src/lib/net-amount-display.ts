import type { DisplayUnit } from "@dang/contracts";
import { displayUnitLabel, formatMoney } from "@dang/ui";

/**
 * Storage is always IRR minor (rial = 1). Display never mutates stored values.
 *
 * Display pipeline for net amounts (order matters):
 * 1) take absolute value of IRR minor
 * 2) convert to display unit (toman = truncate abs/10 toward zero)
 * 3) credit/debt/settled wording comes only from the original sign
 */

export type NetBalanceTone = "credit" | "debt" | "settled";

function toSignedIrrMinor(amountMinor: string | number | bigint): bigint {
  if (typeof amountMinor === "bigint") return amountMinor;
  if (typeof amountMinor === "number") return BigInt(Math.trunc(amountMinor));
  return BigInt(amountMinor || "0");
}

export function absIrrMinor(amountMinor: string | number | bigint): string {
  const n = toSignedIrrMinor(amountMinor);
  return (n < 0n ? -n : n).toString();
}

/**
 * Absolute IRR → display integer: abs first, then unit conversion with truncate
 * (toman = absRial / 10n). Sign is intentionally discarded here.
 */
export function netDisplayAmountInteger(
  amountMinor: string | number | bigint,
  unit: DisplayUnit,
): bigint {
  const abs = BigInt(absIrrMinor(amountMinor));
  return unit === "rial" ? abs : abs / 10n;
}

export function netBalanceTone(
  amountMinor: string | number | bigint,
): NetBalanceTone {
  const n = toSignedIrrMinor(amountMinor);
  if (n > 0n) return "credit";
  if (n < 0n) return "debt";
  return "settled";
}

/**
 * Replace +/- signs with clear Persian wording.
 * `you` → طلب شما / بدهی شما; `party` → طلبکار / بدهکار (other members).
 */
export function netBalancePhrase(
  tone: NetBalanceTone,
  perspective: "you" | "party" = "you",
): string {
  if (tone === "settled") return "تسویه";
  if (perspective === "you") {
    return tone === "credit" ? "طلب شما" : "بدهی شما";
  }
  return tone === "credit" ? "طلبکار" : "بدهکار";
}

/** Full label: phrase + absolute amount + unit (display-only conversion). */
export function formatNetBalanceLabel(
  amountMinor: string | number | bigint,
  unit: DisplayUnit,
  perspective: "you" | "party" = "you",
): string {
  const tone = netBalanceTone(amountMinor);
  const phrase = netBalancePhrase(tone, perspective);
  if (tone === "settled") return phrase;
  const displayAmount = netDisplayAmountInteger(amountMinor, unit);
  const formatted = formatMoney(displayAmount, unit);
  return `${phrase} ${formatted} ${displayUnitLabel(unit)}`;
}
