import { displayUnitLabel, type DisplayUnit } from "@dang/contracts";

/** Form field label with the active unit in parentheses. */
export function moneyFieldLabel(base: string, unit: DisplayUnit): string {
  return `${base} (${displayUnitLabel(unit)})`;
}

/** Suffix after a bare formatted number when not using Amount. */
export function moneyUnitSuffix(unit: DisplayUnit): string {
  return displayUnitLabel(unit);
}
