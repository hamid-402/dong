/**
 * Bounded concurrent enrichment of directory entries with actor net + open settlements.
 * Failures omit fields — never invent zeros.
 */

import type { WorkspaceDirectoryEntry } from "@dang/contracts";
import type { LedgerStore } from "../ledger/ledger.types.js";
import type { SettlementStore } from "../settlements/settlement.types.js";

export const DIRECTORY_METRICS_CONCURRENCY = 6;

export type DirectoryMetricSlice = {
  myNetMinor: string;
  openSettlements: number;
};

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

export async function loadDirectoryMetricSlice(input: {
  workspaceId: string;
  actorUserId: string;
  ledger: LedgerStore;
  settlements: SettlementStore;
}): Promise<DirectoryMetricSlice | null> {
  try {
    const [balanceLines, settlementRows] = await Promise.all([
      input.ledger.balancesForWorkspace(input.workspaceId, input.actorUserId),
      input.settlements.listForWorkspace(input.workspaceId, input.actorUserId),
    ]);
    const myLine = balanceLines.find((line) => line.userId === input.actorUserId);
    if (!myLine) return null;
    let openSettlements = 0;
    for (const row of settlementRows) {
      if (row.status === "claimed" || row.status === "disputed") {
        openSettlements += 1;
      }
    }
    return {
      myNetMinor: myLine.net.amountMinor,
      openSettlements,
    };
  } catch {
    return null;
  }
}

export async function enrichDirectoryEntriesWithMetrics(input: {
  entries: WorkspaceDirectoryEntry[];
  actorUserId: string;
  ledger: LedgerStore;
  settlements: SettlementStore;
  concurrency?: number;
}): Promise<{
  entries: WorkspaceDirectoryEntry[];
  enrichedCount: number;
}> {
  let enrichedCount = 0;
  const enriched = await mapPool(
    input.entries,
    input.concurrency ?? DIRECTORY_METRICS_CONCURRENCY,
    async (entry) => {
      const slice = await loadDirectoryMetricSlice({
        workspaceId: entry.id,
        actorUserId: input.actorUserId,
        ledger: input.ledger,
        settlements: input.settlements,
      });
      if (!slice) return entry;
      enrichedCount += 1;
      return {
        ...entry,
        myNetMinor: slice.myNetMinor,
        openSettlements: slice.openSettlements,
      };
    },
  );
  return { entries: enriched, enrichedCount };
}
