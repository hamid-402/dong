import type { DisplayUnit } from "@dang/contracts";
import { displayUnitLabel, formatMoneyFromIrrMinor } from "@dang/ui";

/**
 * Storage is always IRR minor (rial = 1). Display converts to the chosen unit
 * (toman = floor(irr/10)) — never mutate stored values.
 */

export type NetBalanceTone = "credit" | "debt" | "settled";

export function absIrrMinor(amountMinor: string | number | bigint): string {
  const n =
    typeof amountMinor === "bigint"
      ? amountMinor
      : BigInt(
          typeof amountMinor === "number"
            ? Math.trunc(amountMinor)
            : amountMinor || "0",
        );
  return (n < 0n ? -n : n).toString();
}

export function netBalanceTone(
  amountMinor: string | number | bigint,
): NetBalanceTone {
  const n =
    typeof amountMinor === "bigint"
      ? amountMinor
      : BigInt(
          typeof amountMinor === "number"
            ? Math.trunc(amountMinor)
            : amountMinor || "0",
        );
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
  const formatted = formatMoneyFromIrrMinor(absIrrMinor(amountMinor), unit);
  return `${phrase} ${formatted} ${displayUnitLabel(unit)}`;
}
