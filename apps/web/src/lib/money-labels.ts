import { displayUnitLabel, type DisplayUnit } from "@dang/contracts";

/**
 * Form field label. The unit is shown once by MoneyInput next to the field,
 * so it is intentionally not appended here.
 */
export function moneyFieldLabel(base: string, _unit?: DisplayUnit): string {
  return base;
}

/** Suffix after a bare formatted number when not using Amount. */
export function moneyUnitSuffix(unit: DisplayUnit): string {
  return displayUnitLabel(unit);
}
