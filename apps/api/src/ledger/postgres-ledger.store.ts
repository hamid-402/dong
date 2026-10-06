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
import type {
  LedgerStore,
  LedgerWriteOptions,
  OnBehalfJournalInput,
  PaymentReceiptJournalInput,
  RebuildExpenseJournalResult,
} from "./ledger.types.js";

function mapEntry(
  entry: typeof journalEntry.$inferSelect,
  lines: Array<typeof journalLine.$inferSelect>,
): JournalEntrySummary {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    status: entry.status === "reversed" ? "reversed" : "posted",
    currency: "IRR",
    idempotencyKey: entry.idempotencyKey,
    actorUserId: entry.actorUserId,
    occurredOn: entry.occurredOn,
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

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresLedgerStore {
    const { db } = createDatabase(connectionString);
    return new PostgresLedgerStore(db);
  }

  async postExpense(
    actorUserId: string,
    expense: ExpenseSummary,
    options?: LedgerWriteOptions,
  ): Promise<JournalEntrySummary> {
    if (expense.status !== "posted") {
      throw new Error("LEDGER_EXPENSE_STATUS");
    }
    return this.post(
      actorUserId,
      {
        workspaceId: expense.workspaceId,
        sourceType: "expense",
        sourceId: expense.id,
        idempotencyKey: `expense.post:${expense.id}`,
        lines: buildExpenseJournalLines(expense, {
          fundAsSettlementParty: options?.fundAsSettlementParty,
          defaultFundId: options?.defaultFundId,
        }),
        occurredOn: expense.occurredOn,
      },
      options?.tx,
    );
  }

  async reverseExpense(
    workspaceId: string,
    actorUserId: string,
    expenseId: string,
    options?: LedgerWriteOptions,
  ): Promise<void> {
    const work = async (tx: AppDatabase) => {
      await tx
        .update(journalEntry)
        .set({ status: "reversed" })
        .where(
          and(
            eq(journalEntry.workspaceId, workspaceId),
            eq(journalEntry.sourceType, "expense"),
            eq(journalEntry.sourceId, expenseId),
          ),
        );
    };
    if (options?.tx) {
      await work(options.tx);
      return;
    }
    await withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      work,
    );
  }

  async rebuildExpenseJournal(
    actorUserId: string,
    expense: ExpenseSummary,
    options?: LedgerWriteOptions,
  ): Promise<RebuildExpenseJournalResult> {
    if (expense.status !== "posted") {
      throw new Error("LEDGER_EXPENSE_STATUS");
    }
    const work = async (activeTx: AppDatabase) => {
      const existingRows = await activeTx
        .select()
        .from(journalEntry)
        .where(
          and(
            eq(journalEntry.workspaceId, expense.workspaceId),
            eq(journalEntry.sourceType, "expense"),
            eq(journalEntry.sourceId, expense.id),
          ),
        )
        .limit(1);
      const existing = existingRows[0];
      if (existing) {
        const lines = await activeTx
          .select()
          .from(journalLine)
          .where(eq(journalLine.entryId, existing.id));
        const mapped = mapEntry(existing, lines);
        const alreadyFund =
          mapped.status === "posted" &&
          mapped.lines.some((l) => l.accountCode.startsWith("fund:"));
        if (alreadyFund && !options?.force) {
          return { status: "skipped" as const, entry: mapped };
        }
        const legacySource = `${expense.id}#legacy-${existing.id.slice(0, 8)}`;
        await activeTx
          .update(journalEntry)
          .set({
            status: "reversed",
            sourceId: legacySource,
            idempotencyKey: `expense.post.legacy:${existing.id}`,
          })
          .where(eq(journalEntry.id, existing.id));
      }

      const entry = await this.post(
        actorUserId,
        {
          workspaceId: expense.workspaceId,
          sourceType: "expense",
          sourceId: expense.id,
          idempotencyKey: `expense.fund_party.rebuild:${expense.id}:${Date.now()}`,
          lines: buildExpenseJournalLines(expense, {
            fundAsSettlementParty: options?.fundAsSettlementParty,
            defaultFundId: options?.defaultFundId,
          }),
          occurredOn: expense.occurredOn,
        },
        activeTx,
      );
      return {
        status: (existing ? "rebuilt" : "created"),
        entry,
      };
    };

    if (options?.tx) return work(options.tx);
    return withTenantContext(
      this.db,
      { workspaceId: expense.workspaceId, userId: actorUserId },
      work,
    );
  }

  async postSettlement(
    actorUserId: string,
    settlement: SettlementSummary,
    options?: { tx?: AppDatabase },
  ): Promise<JournalEntrySummary> {
    if (settlement.status !== "confirmed") {
      throw new Error("LEDGER_SETTLEMENT_STATUS");
    }
    return this.post(
      actorUserId,
      {
        workspaceId: settlement.workspaceId,
        sourceType: "settlement",
        sourceId: settlement.id,
        idempotencyKey: `settlement.confirm:${settlement.id}`,
        lines: buildSettlementJournalLines(settlement),
        occurredOn: settlement.createdAt.slice(0, 10),
      },
      options?.tx,
    );
  }

  async postPaymentReceipt(
    actorUserId: string,
    input: PaymentReceiptJournalInput,
    options?: { tx?: AppDatabase },
  ): Promise<JournalEntrySummary> {
    return this.post(
      actorUserId,
      {
        workspaceId: input.workspaceId,
        sourceType: "payment_receipt",
        sourceId: input.receiptId,
        idempotencyKey: `payment_receipt.approve:${input.receiptId}`,
        lines: buildPaymentReceiptJournalLines({
          payerUserId: input.payerUserId,
          counterpartyUserId: input.counterpartyUserId,
          amount: input.amount,
        }),
      },
      options?.tx,
    );
  }

  async postOnBehalfPayment(
    actorUserId: string,
    input: OnBehalfJournalInput,
    options?: { tx?: AppDatabase },
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
    return this.post(
      actorUserId,
      {
        workspaceId: input.workspaceId,
        sourceType: "payment_on_behalf",
        sourceId: input.onBehalfId,
        idempotencyKey: `payment_on_behalf.approve:${input.onBehalfId}`,
        lines,
      },
      options?.tx,
    );
  }

  private async post(
    actorUserId: string,
    input: {
      workspaceId: string;
      sourceType: JournalEntrySummary["sourceType"];
      sourceId: string;
      idempotencyKey: string;
      lines: JournalLine[];
      occurredOn?: string;
    },
    tx?: AppDatabase,
  ): Promise<JournalEntrySummary> {
    assertBalancedJournalLines(input.lines);
    const occurredOn =
      input.occurredOn && /^\d{4}-\d{2}-\d{2}/.test(input.occurredOn)
        ? input.occurredOn.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const work = async (activeTx: AppDatabase) => {
      const existing = await activeTx
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
        const lines = await activeTx
          .select()
          .from(journalLine)
          .where(eq(journalLine.entryId, existing[0].id));
        return mapEntry(existing[0], lines);
      }

      const inserted = await activeTx
        .insert(journalEntry)
        .values({
          workspaceId: input.workspaceId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          status: "posted",
          currency: "IRR",
          idempotencyKey: input.idempotencyKey,
          actorUserId,
          occurredOn,
        })
        .returning();

      const entry = inserted[0];
      if (!entry) {
        throw new Error("LEDGER_INSERT_FAILED");
      }

      const lineRows = await activeTx
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
    };

    if (tx) return work(tx);
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      work,
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
