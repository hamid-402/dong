export type Money = {
  amountMinor: string;
  currency: "IRR";
};

/** Display preference for amounts. Storage remains IRR minor always. */
export type DisplayUnit = "rial" | "toman";

/**
 * Resolve effective display unit: user preference → workspace → rial default (S11-05).
 */
export function resolveDisplayUnit(
  userPreference?: DisplayUnit | null,
  workspaceUnit?: DisplayUnit | null,
): DisplayUnit {
  if (userPreference === "rial" || userPreference === "toman") return userPreference;
  if (workspaceUnit === "rial" || workspaceUnit === "toman") return workspaceUnit;
  return "rial";
}

export function displayUnitLabel(unit: DisplayUnit): string {
  return unit === "toman" ? "تومان" : "ریال";
}

/**
 * Convert IRR minor (1 = 1 rial) to a display integer for the chosen unit.
 * toman = floor(irr / 10). Remainder rials are truncated for display only.
 */
export function irrMinorToDisplayInteger(
  amountMinor: string | number | bigint,
  unit: DisplayUnit,
): bigint {
  const irr =
    typeof amountMinor === "bigint"
      ? amountMinor
      : BigInt(typeof amountMinor === "number" ? Math.trunc(amountMinor) : amountMinor);
  if (unit === "rial") return irr;
  return irr / 10n;
}

/** Parse a display integer back to IRR minor for forms. */
export function displayIntegerToIrrMinor(
  displayAmount: string | number | bigint,
  unit: DisplayUnit,
): string {
  const n =
    typeof displayAmount === "bigint"
      ? displayAmount
      : BigInt(typeof displayAmount === "number" ? Math.trunc(displayAmount) : displayAmount);
  if (n < 0n) throw new Error("AMOUNT_NEGATIVE");
  return unit === "toman" ? (n * 10n).toString() : n.toString();
}
