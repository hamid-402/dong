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
  /** Marks the journal entry for a posted expense as reversed (balances ignore it). */
  reverseExpense(
    workspaceId: string,
    actorUserId: string,
    expenseId: string,
  ): Promise<void>;
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
