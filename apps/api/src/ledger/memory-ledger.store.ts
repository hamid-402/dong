import {
  assertBalancedJournalLines,
  buildExpenseJournalLines,
  buildOnBehalfFundingTransferLines,
  buildOnBehalfJournalLines,
  buildPaymentReceiptJournalLines,
  buildSettlementJournalLines,
  computeBalancesFromJournal,
  type ExpenseSummary,
  type JournalEntrySummary,
  type SettlementSummary,
} from "@dang/contracts";
import type {
  LedgerStore,
  LedgerWriteOptions,
  OnBehalfJournalInput,
  PaymentReceiptJournalInput,
  RebuildExpenseJournalResult,
} from "./ledger.types.js";

export class MemoryLedgerStore implements LedgerStore {
  readonly persistence = "memory" as const;

  private readonly entries = new Map<string, JournalEntrySummary>();
  private readonly sourceIndex = new Map<string, string>();

  private sourceKey(
    workspaceId: string,
    sourceType: JournalEntrySummary["sourceType"],
    sourceId: string,
  ): string {
    return `${workspaceId}:${sourceType}:${sourceId}`;
  }

  async postExpense(
    actorUserId: string,
    expense: ExpenseSummary,
    options?: LedgerWriteOptions,
  ): Promise<JournalEntrySummary> {
    if (expense.status !== "posted") {
      throw new Error("LEDGER_EXPENSE_STATUS");
    }
    return this.post({
      workspaceId: expense.workspaceId,
      sourceType: "expense",
      sourceId: expense.id,
      actorUserId,
      idempotencyKey: `expense.post:${expense.id}`,
      lines: buildExpenseJournalLines(expense, {
        fundAsSettlementParty: options?.fundAsSettlementParty,
        defaultFundId: options?.defaultFundId,
      }),
      occurredOn: expense.occurredOn,
    });
  }

  async reverseExpense(
    workspaceId: string,
    actorUserId: string,
    expenseId: string,
  ): Promise<void> {
    void actorUserId;
    const key = this.sourceKey(workspaceId, "expense", expenseId);
    const existingId = this.sourceIndex.get(key);
    if (!existingId) return;
    const existing = this.entries.get(existingId);
    if (!existing) return;
    this.entries.set(existingId, { ...existing, status: "reversed" });
  }

  async rebuildExpenseJournal(
    actorUserId: string,
    expense: ExpenseSummary,
    options?: LedgerWriteOptions,
  ): Promise<RebuildExpenseJournalResult> {
    if (expense.status !== "posted") {
      throw new Error("LEDGER_EXPENSE_STATUS");
    }
    const key = this.sourceKey(expense.workspaceId, "expense", expense.id);
    const existingId = this.sourceIndex.get(key);
    const existing = existingId ? this.entries.get(existingId) : undefined;
    const alreadyFund =
      existing?.status === "posted" &&
      existing.lines.some((l) => l.accountCode.startsWith("fund:"));
    if (alreadyFund && !options?.force) {
      return { status: "skipped", entry: existing };
    }

    if (existing) {
      const legacySource = `${expense.id}#legacy-${existing.id.slice(0, 8)}`;
      const legacyKey = this.sourceKey(
        expense.workspaceId,
        "expense",
        legacySource,
      );
      this.entries.set(existingId!, {
        ...existing,
        status: "reversed",
        sourceId: legacySource,
        idempotencyKey: `expense.post.legacy:${existing.id}`,
      });
      this.sourceIndex.delete(key);
      this.sourceIndex.set(legacyKey, existingId!);
    }

    const entry = await this.post({
      workspaceId: expense.workspaceId,
      sourceType: "expense",
      sourceId: expense.id,
      actorUserId,
      idempotencyKey: `expense.fund_party.rebuild:${expense.id}:${Date.now()}`,
      lines: buildExpenseJournalLines(expense, {
        fundAsSettlementParty: options?.fundAsSettlementParty,
        defaultFundId: options?.defaultFundId,
      }),
      occurredOn: expense.occurredOn,
    });
    return {
      status: existing ? "rebuilt" : "created",
      entry,
    };
  }

  async postSettlement(
    actorUserId: string,
    settlement: SettlementSummary,
  ): Promise<JournalEntrySummary> {
    if (settlement.status !== "confirmed") {
      throw new Error("LEDGER_SETTLEMENT_STATUS");
    }
    return this.post({
      workspaceId: settlement.workspaceId,
      sourceType: "settlement",
      sourceId: settlement.id,
      actorUserId,
      idempotencyKey: `settlement.confirm:${settlement.id}`,
      lines: buildSettlementJournalLines(settlement),
      occurredOn: settlement.createdAt.slice(0, 10),
    });
  }

  async postPaymentReceipt(
    actorUserId: string,
    input: PaymentReceiptJournalInput,
  ): Promise<JournalEntrySummary> {
    return this.post({
      workspaceId: input.workspaceId,
      sourceType: "payment_receipt",
      sourceId: input.receiptId,
      actorUserId,
      idempotencyKey: `payment_receipt.approve:${input.receiptId}`,
      lines: buildPaymentReceiptJournalLines({
        payerUserId: input.payerUserId,
        counterpartyUserId: input.counterpartyUserId,
        amount: input.amount,
      }),
    });
  }

  async postOnBehalfPayment(
    actorUserId: string,
    input: OnBehalfJournalInput,
  ): Promise<JournalEntrySummary> {
    const lines = input.fundingTransfer
      ? buildOnBehalfFundingTransferLines({
          debtorUserId: input.debtorUserId,
          payerUserId: input.payerUserId,
          amount: input.amount,
        })
      : buildOnBehalfJournalLines({
          debtorUserId: input.debtorUserId,
          payerUserId: input.payerUserId,
          amount: input.amount,
        });
    return this.post({
      workspaceId: input.workspaceId,
      sourceType: "payment_on_behalf",
      sourceId: input.onBehalfId,
      actorUserId,
      idempotencyKey: `payment_on_behalf.approve:${input.onBehalfId}`,
      lines,
    });
  }

  private post(input: {
    workspaceId: string;
    sourceType: JournalEntrySummary["sourceType"];
    sourceId: string;
    actorUserId: string;
    idempotencyKey: string;
    lines: JournalEntrySummary["lines"];
    occurredOn?: string;
  }): Promise<JournalEntrySummary> {
    assertBalancedJournalLines(input.lines);
    const key = this.sourceKey(input.workspaceId, input.sourceType, input.sourceId);
    const existingId = this.sourceIndex.get(key);
    if (existingId) {
      const existing = this.entries.get(existingId);
      if (!existing) {
        throw new Error("LEDGER_CORRUPT");
      }
      return Promise.resolve(existing);
    }

    const createdAt = new Date().toISOString();
    const occurredOn =
      input.occurredOn && /^\d{4}-\d{2}-\d{2}/.test(input.occurredOn)
        ? input.occurredOn.slice(0, 10)
        : createdAt.slice(0, 10);
    const id = crypto.randomUUID();
    const entry: JournalEntrySummary = {
      id,
      workspaceId: input.workspaceId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "posted",
      currency: "IRR",
      lines: input.lines,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId,
      occurredOn,
      createdAt,
    };
    this.entries.set(id, entry);
    this.sourceIndex.set(key, id);
    return Promise.resolve(entry);
  }

  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JournalEntrySummary[]> {
    void actorUserId;
    const result: JournalEntrySummary[] = [];
    for (const entry of this.entries.values()) {
      if (entry.workspaceId === workspaceId) result.push(entry);
    }
    return Promise.resolve(
      result.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async balancesForWorkspace(workspaceId: string, actorUserId: string) {
    return computeBalancesFromJournal(
      await this.listForWorkspace(workspaceId, actorUserId),
    );
  }

  remapUserId(
    workspaceId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<number> {
    if (fromUserId === toUserId) return Promise.resolve(0);
    let lines = 0;
    for (const [id, entry] of this.entries) {
      if (entry.workspaceId !== workspaceId) continue;
      let changed = false;
      const nextLines = entry.lines.map((line) => {
        if (line.userId !== fromUserId) return line;
        changed = true;
        lines += 1;
        return { ...line, userId: toUserId };
      });
      if (changed) {
        this.entries.set(id, { ...entry, lines: nextLines });
      }
    }
    return Promise.resolve(lines);
  }
}
