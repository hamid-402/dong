import {
  assertBalancedJournalLines,
  buildExpenseJournalLines,
  buildSettlementJournalLines,
  computeBalancesFromJournal,
  type ExpenseSummary,
  type JournalEntrySummary,
  type JournalLine,
  type SettlementSummary,
} from "@dang/contracts";
import {
  and,
  createDatabase,
  eq,
  journalEntry,
  journalLine,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { LedgerStore } from "./ledger.types.js";

function mapEntry(
  entry: typeof journalEntry.$inferSelect,
  lines: Array<typeof journalLine.$inferSelect>,
): JournalEntrySummary {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    status: "posted",
    currency: "IRR",
    idempotencyKey: entry.idempotencyKey,
    actorUserId: entry.actorUserId,
    createdAt: entry.createdAt.toISOString(),
    lines: lines
      .sort((a, b) => a.lineNo - b.lineNo)
      .map(
        (line): JournalLine => ({
          accountCode: line.accountCode,
          userId: line.userId,
          side: line.side,
          amount: {
            amountMinor: line.amountMinor.toString(),
            currency: "IRR",
          },
        }),
      ),
  };
}

export class PostgresLedgerStore implements LedgerStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresLedgerStore {
    const { db } = createDatabase(connectionString);
    return new PostgresLedgerStore(db);
  }

  async postExpense(
    actorUserId: string,
    expense: ExpenseSummary,
  ): Promise<JournalEntrySummary> {
    if (expense.status !== "posted") {
      throw new Error("LEDGER_EXPENSE_STATUS");
    }
    return this.post(actorUserId, {
      workspaceId: expense.workspaceId,
      sourceType: "expense",
      sourceId: expense.id,
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
    return this.post(actorUserId, {
      workspaceId: settlement.workspaceId,
      sourceType: "settlement",
      sourceId: settlement.id,
      idempotencyKey: `settlement.confirm:${settlement.id}`,
      lines: buildSettlementJournalLines(settlement),
    });
  }

  private async post(
    actorUserId: string,
    input: {
      workspaceId: string;
      sourceType: JournalEntrySummary["sourceType"];
      sourceId: string;
      idempotencyKey: string;
      lines: JournalLine[];
    },
  ): Promise<JournalEntrySummary> {
    assertBalancedJournalLines(input.lines);

    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(journalEntry)
          .where(
            and(
              eq(journalEntry.workspaceId, input.workspaceId),
              eq(journalEntry.sourceType, input.sourceType),
              eq(journalEntry.sourceId, input.sourceId),
            ),
          )
          .limit(1);

        if (existing[0]) {
          const lines = await tx
            .select()
            .from(journalLine)
            .where(eq(journalLine.entryId, existing[0].id));
          return mapEntry(existing[0], lines);
        }

        const inserted = await tx
          .insert(journalEntry)
          .values({
            workspaceId: input.workspaceId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            status: "posted",
            currency: "IRR",
            idempotencyKey: input.idempotencyKey,
            actorUserId,
          })
          .returning();

        const entry = inserted[0];
        if (!entry) {
          throw new Error("LEDGER_INSERT_FAILED");
        }

        const lineRows = await tx
          .insert(journalLine)
          .values(
            input.lines.map((line, index) => ({
              entryId: entry.id,
              workspaceId: input.workspaceId,
              accountCode: line.accountCode,
              userId: line.userId,
              side: line.side,
              amountMinor: BigInt(line.amount.amountMinor),
              currency: "IRR",
              lineNo: index + 1,
            })),
          )
          .returning();

        return mapEntry(entry, lineRows);
      },
    );
  }

  async listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<JournalEntrySummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const entries = await tx
          .select()
          .from(journalEntry)
          .where(eq(journalEntry.workspaceId, workspaceId));

        const results: JournalEntrySummary[] = [];
        for (const entry of entries) {
          const lines = await tx
            .select()
            .from(journalLine)
            .where(eq(journalLine.entryId, entry.id));
          results.push(mapEntry(entry, lines));
        }
        return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
    );
  }

  async balancesForWorkspace(workspaceId: string, actorUserId: string) {
    return computeBalancesFromJournal(
      await this.listForWorkspace(workspaceId, actorUserId),
    );
  }
}
