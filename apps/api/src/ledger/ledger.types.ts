import type {
  BalanceLine,
  ExpenseSummary,
  JournalEntrySummary,
  Money,
  SettlementSummary,
} from "@dang/contracts";
import type { AppDatabase } from "@dang/db";

export type LedgerWriteOptions = {
  tx?: AppDatabase;
  /** When set, expense journals may use fund:{id} as settlement party. */
  fundAsSettlementParty?: boolean;
  defaultFundId?: string;
  /** Rebuild even when journal already has fund:* lines. */
  force?: boolean;
};

export type RebuildExpenseJournalResult = {
  status: "rebuilt" | "skipped" | "created";
  entry: JournalEntrySummary;
};

export type PaymentReceiptJournalInput = {
  workspaceId: string;
  receiptId: string;
  payerUserId: string;
  counterpartyUserId: string;
  amount: Money;
};

export type OnBehalfJournalInput = {
  workspaceId: string;
  onBehalfId: string;
  debtorUserId: string;
  payerUserId: string;
  amount: Money;
  /** When true, lines transfer credit to payer after settlement confirm. */
  fundingTransfer?: boolean;
};

export type LedgerStore = {
  readonly persistence: "memory" | "postgres";
  readonly db?: AppDatabase;
  postExpense(
    actorUserId: string,
    expense: ExpenseSummary,
    options?: LedgerWriteOptions,
  ): Promise<JournalEntrySummary>;
  /** Marks the journal entry for a posted expense as reversed (balances ignore it). */
  reverseExpense(
    workspaceId: string,
    actorUserId: string,
    expenseId: string,
    options?: LedgerWriteOptions,
  ): Promise<void>;
  /**
   * Re-post expense journal under fund-as-settlement-party rules.
   * Supersedes the prior source entry (rename + reverse) then inserts fresh lines.
   */
  rebuildExpenseJournal(
    actorUserId: string,
    expense: ExpenseSummary,
    options?: LedgerWriteOptions,
  ): Promise<RebuildExpenseJournalResult>;
  postSettlement(
    actorUserId: string,
    settlement: SettlementSummary,
    options?: LedgerWriteOptions,
  ): Promise<JournalEntrySummary>;
  postPaymentReceipt(
    actorUserId: string,
    input: PaymentReceiptJournalInput,
    options?: LedgerWriteOptions,
  ): Promise<JournalEntrySummary>;
  postOnBehalfPayment(
    actorUserId: string,
    input: OnBehalfJournalInput,
    options?: LedgerWriteOptions,
  ): Promise<JournalEntrySummary>;
  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JournalEntrySummary[]>;
  balancesForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<BalanceLine[]>;
  /** Remap journal line user ids after guest claim. Returns lines touched. */
  remapUserId?(
    workspaceId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<number>;
};

export const LEDGER_STORE = Symbol("LEDGER_STORE");
