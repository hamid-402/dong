import {
  assertBalancedJournalLines,
  buildExpenseJournalLines,
  buildSettlementJournalLines,
  computeBalancesFromJournal,
  type ExpenseSummary,
  type JournalEntrySummary,
  type SettlementSummary,
} from "@dang/contracts";
import type { LedgerStore } from "./ledger.types.js";

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
      lines: buildExpenseJournalLines(expense),
    });
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
    });
  }

  private post(input: {
    workspaceId: string;
    sourceType: JournalEntrySummary["sourceType"];
    sourceId: string;
    actorUserId: string;
    idempotencyKey: string;
    lines: JournalEntrySummary["lines"];
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
      createdAt: new Date().toISOString(),
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
}
