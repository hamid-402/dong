import type { Money } from "./money.js";

/** Monthly straight-line depreciation in IRR minor units (integer division). */
export function monthlyDepreciationMinor(
  acquisitionCostMinor: bigint,
  salvageMinor: bigint,
  usefulLifeMonths: number,
): bigint {
  if (usefulLifeMonths <= 0) return 0n;
  const base = acquisitionCostMinor - salvageMinor;
  if (base <= 0n) return 0n;
  return base / BigInt(usefulLifeMonths);
}

export function sameCalendarMonth(aIso: string, bIso: string): boolean {
  return aIso.slice(0, 7) === bIso.slice(0, 7);
}

export type DepreciationTickInput = {
  acquisitionCost: Money;
  salvageMinor?: string;
  usefulLifeMonths?: number;
  accumulatedDepreciationMinor?: string;
  lastDepreciatedOn?: string;
  status: string;
  asOfIso: string;
};

export type DepreciationTickResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      addMinor: bigint;
      nextAccumulatedMinor: bigint;
      lastDepreciatedOn: string;
    };

export function computeDepreciationTick(input: DepreciationTickInput): DepreciationTickResult {
  if (input.status !== "active") {
    return { skipped: true, reason: "not_active" };
  }
  if (input.usefulLifeMonths == null || input.usefulLifeMonths <= 0) {
    return { skipped: true, reason: "no_useful_life" };
  }
  const cost = BigInt(input.acquisitionCost.amountMinor);
  const salvage = BigInt(input.salvageMinor ?? "0");
  if (cost <= 0n) {
    return { skipped: true, reason: "no_cost" };
  }
  if (input.lastDepreciatedOn && sameCalendarMonth(input.lastDepreciatedOn, input.asOfIso)) {
    return { skipped: true, reason: "same_month" };
  }
  const add = monthlyDepreciationMinor(cost, salvage, input.usefulLifeMonths);
  if (add <= 0n) {
    return { skipped: true, reason: "zero_depreciation" };
  }
  const prev = BigInt(input.accumulatedDepreciationMinor ?? "0");
  const next = prev + add;
  const maxDep = cost - salvage;
  const capped = next > maxDep ? maxDep : next;
  const actualAdd = capped - prev;
  if (actualAdd <= 0n) {
    return { skipped: true, reason: "fully_depreciated" };
  }
  return {
    skipped: false,
    addMinor: actualAdd,
    nextAccumulatedMinor: capped,
    lastDepreciatedOn: input.asOfIso.slice(0, 10),
  };
}
