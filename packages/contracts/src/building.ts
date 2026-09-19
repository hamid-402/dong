import type { BalanceLine, FormulaBasis } from "./finance.js";
import type { Money } from "./money.js";

export type GenerateBuildingChargesRequest = {
  /** Calendar month to bill, e.g. 2026-03 */
  yearMonth: string;
  /** IRR minor charged per occupied unit for the month. */
  amountMinorPerUnit: string;
  autoPost?: boolean;
  idempotencyKey: string;
};

export type BuildingChargeGenerateLine = {
  subunitId: string;
  expenseId: string;
  status: string;
};

export type BuildingChargeSkippedLine = {
  subunitId: string;
  reason: string;
  expenseId?: string;
};

export type GenerateBuildingChargesResult = {
  created: BuildingChargeGenerateLine[];
  skipped: BuildingChargeSkippedLine[];
};

export type SubunitFormulaInput = {
  id: string;
  memberUserIds: string[];
  areaSqm?: number;
  occupancy?: number;
};

/**
 * Sum area or occupancy across subunits each participant belongs to.
 * Participants with zero weight are omitted when others have positive weight.
 */
export function buildFormulaWeightsFromSubunits(
  participantUserIds: readonly string[],
  subunits: readonly SubunitFormulaInput[],
  basis: FormulaBasis,
): Array<{ userId: string; weight: number }> {
  const participants = [
    ...new Set(participantUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (participants.length === 0) {
    throw new Error("SPLIT_FORMULA");
  }

  const weights: Array<{ userId: string; weight: number }> = [];
  for (const userId of participants) {
    let sum = 0;
    for (const sub of subunits) {
      if (!sub.memberUserIds.includes(userId)) continue;
      if (basis === "area") {
        const area = sub.areaSqm;
        if (area !== undefined && Number.isFinite(area) && area > 0) {
          sum += area;
        }
      } else {
        const occ = sub.occupancy;
        if (occ !== undefined && Number.isInteger(occ) && occ >= 1) {
          sum += occ;
        }
      }
    }
    if (sum > 0) {
      weights.push({ userId, weight: sum });
    }
  }

  if (weights.length === 0) {
    throw new Error("SPLIT_FORMULA");
  }
  return weights;
}

/** Debtors (net negative) sorted by absolute balance descending — for building UI. */
export function buildingArrearsFromBalances(
  lines: readonly BalanceLine[],
  subunits: readonly SubunitFormulaInput[],
): Array<{ userId: string; net: Money; subunitIds: string[] }> {
  const byUser = new Map<string, bigint>();
  for (const line of lines) {
    byUser.set(line.userId, BigInt(line.net.amountMinor));
  }

  const debtors = [...byUser.entries()]
    .filter(([, net]) => net < 0n)
    .map(([userId, net]) => ({
      userId,
      net: { amountMinor: net.toString(), currency: "IRR" as const },
      abs: -net,
    }))
    .sort((a, b) => (a.abs === b.abs ? a.userId.localeCompare(b.userId) : a.abs > b.abs ? -1 : 1));

  return debtors.map(({ userId, net }) => {
    const subunitIds = subunits
      .filter((s) => s.memberUserIds.includes(userId))
      .map((s) => s.id);
    return { userId, net, subunitIds };
  });
}
