import type { SpaceKind } from "@dang/contracts";
import { formatToman } from "@dang/ui";

export type NetTone = "credit" | "debt" | "settled";

export type NetInfo = {
  toman: number;
  label: string;
  tone: NetTone;
};

/** Actor net in IRR minor → toman display for space/group lists (live dashboard only). */
export function netFromIrrMinor(amountMinor: string | number): NetInfo {
  const minor = typeof amountMinor === "number" ? amountMinor : Number(amountMinor);
  const toman = Number.isFinite(minor) ? Math.round(minor / 10) : 0;
  if (toman > 0) {
    return {
      toman,
      label: `${formatToman(toman)} طلب`,
      tone: "credit",
    };
  }
  if (toman < 0) {
    return {
      toman,
      label: `${formatToman(Math.abs(toman))} بدهی`,
      tone: "debt",
    };
  }
  return { toman: 0, label: "تسویه", tone: "settled" };
}

export type SpaceNetRow = {
  workspaceId: string;
  slug: string;
  name: string;
  /** Keep kinds separate — never mix group/building/org/personal nets. */
  spaceKind: SpaceKind;
  net: NetInfo;
  openSettlements: number;
};

export type SpaceNetAggregate = {
  youAreOwedToman: number;
  youOweToman: number;
  openSettlements: number;
  unsettledCount: number;
  topDebt: SpaceNetRow | null;
  topCredit: SpaceNetRow | null;
};

export const SPACE_KIND_ORDER: SpaceKind[] = [
  "personal",
  "group",
  "building",
  "org",
];

/** Sum of absolute credits / debts — caller must pass rows of one kind only. */
export function aggregateSpaceNets(rows: SpaceNetRow[]): SpaceNetAggregate {
  let youAreOwedToman = 0;
  let youOweToman = 0;
  let openSettlements = 0;
  let unsettledCount = 0;
  let topDebt: SpaceNetRow | null = null;
  let topCredit: SpaceNetRow | null = null;

  for (const row of rows) {
    openSettlements += row.openSettlements;
    if (row.net.tone === "credit") {
      youAreOwedToman += row.net.toman;
      unsettledCount += 1;
      if (!topCredit || row.net.toman > topCredit.net.toman) topCredit = row;
    } else if (row.net.tone === "debt") {
      youOweToman += Math.abs(row.net.toman);
      unsettledCount += 1;
      if (!topDebt || Math.abs(row.net.toman) > Math.abs(topDebt.net.toman)) {
        topDebt = row;
      }
    }
  }

  return {
    youAreOwedToman,
    youOweToman,
    openSettlements,
    unsettledCount,
    topDebt,
    topCredit,
  };
}

/**
 * Bucket nets by space kind so hub UI never blends ledgers.
 * Empty kinds are omitted.
 */
export function groupSpaceNetsByKind(
  rows: SpaceNetRow[],
  onlyKind?: SpaceKind | null,
): Array<{ kind: SpaceKind; rows: SpaceNetRow[]; aggregate: SpaceNetAggregate }> {
  const buckets: Record<SpaceKind, SpaceNetRow[]> = {
    personal: [],
    group: [],
    building: [],
    org: [],
  };
  for (const row of rows) {
    if (onlyKind && row.spaceKind !== onlyKind) continue;
    buckets[row.spaceKind].push(row);
  }
  return SPACE_KIND_ORDER.filter((kind) => buckets[kind].length > 0).map((kind) => ({
    kind,
    rows: buckets[kind],
    aggregate: aggregateSpaceNets(buckets[kind]),
  }));
}

export function sortPeersByAbsNet<T extends { amountMinor: string }>(
  peers: T[],
): Array<T & { net: NetInfo }> {
  return peers
    .map((p) => ({ ...p, net: netFromIrrMinor(p.amountMinor) }))
    .filter((p) => p.net.tone !== "settled")
    .sort((a, b) => Math.abs(b.net.toman) - Math.abs(a.net.toman));
}
