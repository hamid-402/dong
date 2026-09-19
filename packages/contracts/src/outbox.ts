/** Domain outbox event types — payloads stay JSON-serializable. */

export type OutboxEventType =
  | "expense.posted"
  | "expense.reversed"
  | "settlement.confirmed"
  | "invoice.recalculated"
  | "period.rolled"
  | "payment.on_behalf.approved";

/** Members whose live draft invoice changed inside the money transaction. */
export type OutboxInvoiceRecalculatedPayload = {
  periodId: string;
  memberUserIds: string[];
  reason: string;
  /**
   * Correction notices raised because the member's invoice was already locked.
   * These are not a silent redraw: the member acted on a document whose amount
   * has since changed, so they have to be told.
   */
  adjustments?: Array<{
    memberUserId: string;
    /** Signed IRR minor difference against the locked document. */
    deltaMinor: string;
  }>;
  /** Whoever's write produced the recalculation, for the notification trail. */
  actorUserId?: string;
};

/**
 * Someone settled another member's debt and finance approved it. The journal
 * moved for two people who did not ask for it, so both sides' balances are
 * stale and the debtor has to learn their debt was covered.
 */
export type OutboxOnBehalfApprovedPayload = {
  onBehalfId: string;
  debtorUserId: string;
  payerUserId: string;
  amountMinor: string;
  journalEntryId: string;
};

export type OutboxPeriodRolledPayload = {
  periodId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  /** Resolved by the writer, which already holds an authorized actor. */
  memberUserIds: string[];
};

export type OutboxExpensePostedPayload = {
  expenseId: string;
  title: string;
  paidByUserId: string;
  participantUserIds: string[];
  journalEntryId: string;
};

export type OutboxSettlementConfirmedPayload = {
  settlementId: string;
  fromUserId: string;
  toUserId: string;
  amountMinor: string;
  actorUserId: string;
  journalEntryId: string;
};

export type OutboxWriteInput = {
  workspaceId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: OutboxEventType;
  payload: Record<string, unknown>;
  requestId?: string;
  traceId?: string;
};

/** Aggregate outbox relay gauges (ops.outbox_relay_stats / memory mirror). */
export type OutboxRelayStats = {
  pendingCount: number;
  failedPendingCount: number;
  oldestPendingAgeMs: number | null;
};
