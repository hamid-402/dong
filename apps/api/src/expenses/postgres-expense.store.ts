import {
  and,
  createDatabase,
  eq,
  expense,
  expensePaymentLine,
  expenseSplitLine,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { CreateExpenseDraftRequest, ExpenseSummary } from "@dang/contracts";
import {
  asSplitMethod,
  toExpenseSummary,
  validateExpenseDraftInput,
  type ExpenseStore,
  type StoredExpense,
} from "./expense.types.js";

function formatOccurredOn(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function mapExpense(
  row: typeof expense.$inferSelect,
  splits: Array<typeof expenseSplitLine.$inferSelect>,
  payments: Array<typeof expensePaymentLine.$inferSelect>,
): StoredExpense {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    status: row.status,
    total: { amountMinor: row.totalMinor.toString(), currency: "IRR" },
    paidByUserId: row.paidByUserId,
    paymentLines: payments
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        userId: line.userId,
        amount: { amountMinor: line.amountMinor.toString(), currency: "IRR" },
      })),
    splitMethod: asSplitMethod(row.splitMethod),
    participantUserIds: splits.map((line) => line.userId),
    splits: splits
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        userId: line.userId,
        amount: { amountMinor: line.amountMinor.toString(), currency: "IRR" },
        percent: line.percentBp != null ? String(line.percentBp) : undefined,
        shares: line.shares ?? undefined,
      })),
    occurredOn: formatOccurredOn(row.occurredOn),
    createdAt: row.createdAt.toISOString(),
    note: row.note ?? undefined,
    idempotencyKey: row.idempotencyKey,
    createdByUserId: row.createdByUserId,
  };
}

export class PostgresExpenseStore implements ExpenseStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresExpenseStore {
    const { db } = createDatabase(connectionString);
    return new PostgresExpenseStore(db);
  }

  async createDraft(
    actorUserId: string,
    input: CreateExpenseDraftRequest,
  ): Promise<StoredExpense> {
    const { paymentLines, splits } = validateExpenseDraftInput(input);

    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(expense)
          .where(
            and(
              eq(expense.workspaceId, input.workspaceId),
              eq(expense.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);

        if (existing[0]) {
          return this.loadExpense(tx, existing[0].id, input.workspaceId);
        }

        const inserted = await tx
          .insert(expense)
          .values({
            workspaceId: input.workspaceId,
            title: input.title.trim(),
            note: input.note?.trim() || null,
            status: "draft",
            totalMinor: BigInt(input.total.amountMinor),
            paidByUserId: input.paidByUserId.trim(),
            splitMethod: input.splitMethod,
            occurredOn: input.occurredOn,
            idempotencyKey: input.idempotencyKey.trim(),
            createdByUserId: actorUserId,
          })
          .returning();

        const row = inserted[0];
        if (!row) {
          throw new Error("EXPENSE_INSERT_FAILED");
        }

        await tx.insert(expenseSplitLine).values(
          splits.map((line, index) => ({
            expenseId: row.id,
            workspaceId: input.workspaceId,
            userId: line.userId,
            amountMinor: BigInt(line.amount.amountMinor),
            percentBp: line.percent ? Number(line.percent) : null,
            shares: line.shares ?? null,
            lineNo: index + 1,
          })),
        );

        await tx.insert(expensePaymentLine).values(
          paymentLines.map((line, index) => ({
            expenseId: row.id,
            workspaceId: input.workspaceId,
            userId: line.userId,
            amountMinor: BigInt(line.amount.amountMinor),
            lineNo: index + 1,
          })),
        );

        return this.loadExpense(tx, row.id, input.workspaceId);
      },
    );
  }

  async listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ExpenseSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(expense)
          .where(eq(expense.workspaceId, workspaceId));

        const result: ExpenseSummary[] = [];
        for (const row of rows) {
          const stored = await this.loadExpense(tx, row.id, workspaceId);
          result.push(toExpenseSummary(stored));
        }
        return result;
      },
    );
  }

  async submit(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense> {
    return this.updateStatus(workspaceId, expenseId, actorUserId, "submitted", [
      "draft",
    ]);
  }

  async post(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense> {
    return this.updateStatus(workspaceId, expenseId, actorUserId, "posted", [
      "draft",
      "submitted",
    ]);
  }

  private async updateStatus(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    nextStatus: StoredExpense["status"],
    allowedFrom: StoredExpense["status"][],
  ): Promise<StoredExpense> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(expense)
          .where(and(eq(expense.id, expenseId), eq(expense.workspaceId, workspaceId)))
          .limit(1);

        const row = existing[0];
        if (!row) {
          throw new Error("EXPENSE_NOT_FOUND");
        }
        if (!allowedFrom.includes(row.status)) {
          throw new Error("EXPENSE_STATUS");
        }

        const updated = await tx
          .update(expense)
          .set({ status: nextStatus })
          .where(eq(expense.id, expenseId))
          .returning();

        const next = updated[0];
        if (!next) {
          throw new Error("EXPENSE_UPDATE_FAILED");
        }
        return this.loadExpense(tx, expenseId, workspaceId);
      },
    );
  }

  private async loadExpense(
    tx: AppDatabase,
    expenseId: string,
    workspaceId: string,
  ): Promise<StoredExpense> {
    const rows = await tx
      .select()
      .from(expense)
      .where(and(eq(expense.id, expenseId), eq(expense.workspaceId, workspaceId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new Error("EXPENSE_NOT_FOUND");
    }

    const splits = await tx
      .select()
      .from(expenseSplitLine)
      .where(eq(expenseSplitLine.expenseId, expenseId));

    const payments = await tx
      .select()
      .from(expensePaymentLine)
      .where(eq(expensePaymentLine.expenseId, expenseId));

    return mapExpense(row, splits, payments);
  }
}
