export type DisplayUnit = "rial" | "toman";

const numberFormatter = new Intl.NumberFormat("fa-IR");

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII 0-9. */
export function latinDigits(raw: string): string {
  return raw.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return ch;
  });
}

export function displayUnitLabel(unit: DisplayUnit): string {
  return unit === "toman" ? "تومان" : "ریال";
}

function toIrrBigInt(amountMinor: string | number | bigint): bigint {
  if (typeof amountMinor === "bigint") return amountMinor;
  if (typeof amountMinor === "number") return BigInt(Math.trunc(amountMinor));
  return BigInt(amountMinor || "0");
}

export function irrMinorToDisplayInteger(
  amountMinor: string | number | bigint,
  unit: DisplayUnit,
): bigint {
  const irr = toIrrBigInt(amountMinor);
  return unit === "rial" ? irr : irr / 10n;
}

/** @deprecated Prefer formatMoney / formatMoneyFromIrrMinor with an explicit unit. */
export function formatTomanFromIrrMinor(amountMinor: string | number): string {
  return formatMoneyFromIrrMinor(amountMinor, "toman");
}

/** @deprecated Prefer formatMoney with unit "toman". */
export function formatToman(amountToman: number): string {
  return formatMoney(amountToman, "toman");
}

/** Format a display-unit integer (already converted) with fa-IR digits. */
export function formatMoney(amountInUnit: number | bigint | string, _unit: DisplayUnit): string {
  const value =
    typeof amountInUnit === "bigint"
      ? amountInUnit
      : typeof amountInUnit === "string"
        ? BigInt(amountInUnit || "0")
        : BigInt(Math.trunc(amountInUnit));
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    return formatFaInteger(value);
  }
  return numberFormatter.format(Number(value));
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Grouped fa-IR digits for integers Intl cannot format safely. */
function formatFaInteger(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  const persian = grouped.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
  return negative ? `−${persian}` : persian;
}

/** Canonical path: IRR minor → formatted string in the chosen display unit. */
export function formatMoneyFromIrrMinor(
  amountMinor: string | number | bigint,
  unit: DisplayUnit = "rial",
): string {
  return formatMoney(irrMinorToDisplayInteger(amountMinor, unit), unit);
}

/** Formatted amount plus explicit unit label (always shown). */
export function formatMoneyWithUnit(
  amountMinor: string | number | bigint,
  unit: DisplayUnit = "rial",
): string {
  return `${formatMoneyFromIrrMinor(amountMinor, unit)} ${displayUnitLabel(unit)}`;
}
