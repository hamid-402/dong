import type {
  BalanceLine,
  ExpenseSummary,
  JournalEntrySummary,
  SettlementSummary,
} from "@dang/contracts";

export type LedgerStore = {
  readonly persistence: "memory" | "postgres";
  postExpense(
    actorUserId: string,
    expense: ExpenseSummary,
  ): Promise<JournalEntrySummary>;
  postSettlement(
    actorUserId: string,
    settlement: SettlementSummary,
  ): Promise<JournalEntrySummary>;
  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JournalEntrySummary[]>;
  balancesForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<BalanceLine[]>;
};

export const LEDGER_STORE = Symbol("LEDGER_STORE");
