import {
  and,
  createDatabase,
  eq,
  expense,
  expenseItem,
  expenseItemAssignment,
  expensePaymentLine,
  expenseSplitLine,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { CreateExpenseDraftRequest, ExpenseItemSummary, ExpenseSummary } from "@dang/contracts";
import {
  asSplitMethod,
  assertCanMutateExpense,
  canActorViewExpense,
  toExpenseSummary,
  validateExpenseDraftInput,
  type ExpenseStore,
  type ExpenseViewOptions,
  type StoredExpense,
} from "./expense.types.js";

function formatOccurredOn(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function optionalMoney(minor: bigint | null | undefined) {
  if (minor == null) return undefined;
  return { amountMinor: minor.toString(), currency: "IRR" as const };
}

async function loadItems(
  tx: AppDatabase,
  expenseId: string,
): Promise<ExpenseItemSummary[]> {
  const items = await tx
    .select()
    .from(expenseItem)
    .where(eq(expenseItem.expenseId, expenseId));
  const result: ExpenseItemSummary[] = [];
  for (const item of items.sort((a, b) => a.lineNo - b.lineNo)) {
    const assignments = await tx
      .select()
      .from(expenseItemAssignment)
      .where(eq(expenseItemAssignment.itemId, item.id));
    const sharesByUserId: Record<string, number> = {};
    for (const row of assignments) {
      sharesByUserId[row.userId] = row.shares;
    }
    result.push({
      id: item.id,
      lineNo: item.lineNo,
      title: item.title,
      amount: { amountMinor: item.amountMinor.toString(), currency: "IRR" },
      assigneeUserIds: assignments.map((a) => a.userId),
      sharesByUserId,
      notes: item.notes ?? undefined,
    });
  }
  return result;
}

function mapExpense(
  row: typeof expense.$inferSelect,
  splits: Array<typeof expenseSplitLine.$inferSelect>,
  payments: Array<typeof expensePaymentLine.$inferSelect>,
  items: ExpenseItemSummary[],
): StoredExpense {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    periodId: row.periodId ?? undefined,
    outingId: row.outingId ?? undefined,
    title: row.title,
    status: row.status,
    visibility: row.visibility ?? "shared",
    audience:
      row.audience === "finance_and_creator"
        ? "finance_and_creator"
        : "all_members",
    total: { amountMinor: row.totalMinor.toString(), currency: "IRR" },
    tip: optionalMoney(row.tipMinor),
    tax: optionalMoney(row.taxMinor),
    discount: optionalMoney(row.discountMinor),
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
    items: items.length > 0 ? items : undefined,
    categoryId: row.categoryId ?? undefined,
    costCenterId: row.costCenterId ?? undefined,
    budgetId: row.budgetId ?? undefined,
    requiresApproval: row.requiresApproval ?? false,
    approvedByUserId: row.approvedByUserId ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    occurredOn: formatOccurredOn(row.occurredOn),
    createdAt: row.createdAt.toISOString(),
    note: row.note ?? undefined,
    source: row.source === "daily_ledger" ? "daily_ledger" : undefined,
    originalCurrency: row.originalCurrency ?? undefined,
    originalAmountMinor: row.originalAmountMinor?.toString(),
    fxRateId: row.fxRateId ?? undefined,
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
    const { participantUserIds, paymentLines, splits } =
      validateExpenseDraftInput(input);

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
            periodId: input.periodId?.trim() || null,
            outingId: input.outingId?.trim() || null,
            title: input.title.trim(),
            note: input.note?.trim() || null,
            source: input.source === "daily_ledger" ? "daily_ledger" : null,
            status: "draft",
            visibility: input.visibility ?? "shared",
            audience: input.audience ?? "all_members",
            totalMinor: BigInt(input.total.amountMinor),
            originalCurrency: input.originalCurrency ?? null,
            originalAmountMinor: input.originalAmountMinor ? BigInt(input.originalAmountMinor) : null,
            tipMinor: input.tip ? BigInt(input.tip.amountMinor) : null,
            taxMinor: input.tax ? BigInt(input.tax.amountMinor) : null,
            discountMinor: input.discount ? BigInt(input.discount.amountMinor) : null,
            paidByUserId: input.paidByUserId.trim(),
            splitMethod: input.splitMethod,
            categoryId: input.categoryId?.trim() || null,
            costCenterId: input.costCenterId?.trim() || null,
            budgetId: input.budgetId?.trim() || null,
            requiresApproval:
              input.requiresApproval ?? input.visibility === "company",
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

        if (input.splitMethod === "itemized" && input.items?.length) {
          for (let index = 0; index < input.items.length; index += 1) {
            const item = input.items[index]!;
            const insertedItems = await tx
              .insert(expenseItem)
              .values({
                expenseId: row.id,
                workspaceId: input.workspaceId,
                lineNo: index + 1,
                title: item.title.trim(),
                amountMinor: BigInt(item.amount.amountMinor),
                notes: item.notes?.trim() || null,
              })
              .returning();
            const itemRow = insertedItems[0];
            if (!itemRow) continue;
            const assignees = [...new Set(item.assigneeUserIds.map((id) => id.trim()))];
            if (assignees.length === 0) continue;
            await tx.insert(expenseItemAssignment).values(
              assignees.map((userId) => ({
                itemId: itemRow.id,
                userId,
                shares: item.sharesByUserId?.[userId] ?? 1,
              })),
            );
          }
        }

        void participantUserIds;
        return this.loadExpense(tx, row.id, input.workspaceId);
      },
    );
  }

  async listForWorkspace(
    workspaceId: string,
    actorUserId: string,
    options?: ExpenseViewOptions,
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
          if (!canActorViewExpense(stored, actorUserId, options)) continue;
          result.push(toExpenseSummary(stored));
        }
        return result;
      },
    );
  }

  async get(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense | null> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(expense)
          .where(and(eq(expense.id, expenseId), eq(expense.workspaceId, workspaceId)))
          .limit(1);
        if (!rows[0]) return null;
        return this.loadExpense(tx, expenseId, workspaceId);
      },
    );
  }

  async submit(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    options?: ExpenseViewOptions,
  ): Promise<StoredExpense> {
    return this.updateStatus(
      workspaceId,
      expenseId,
      actorUserId,
      "submitted",
      ["draft"],
      "submit",
      options,
    );
  }

  async post(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    options?: ExpenseViewOptions,
  ): Promise<StoredExpense> {
    return this.updateStatus(
      workspaceId,
      expenseId,
      actorUserId,
      "posted",
      ["draft", "submitted"],
      "post",
      options,
    );
  }

  async approve(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    options?: ExpenseViewOptions,
  ): Promise<StoredExpense> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const stored = await this.loadExpense(tx, expenseId, workspaceId);
        assertCanMutateExpense(stored, actorUserId, "post", options);
        if (
          !stored.requiresApproval ||
          stored.status === "posted" ||
          stored.status === "reversed"
        ) {
          throw new Error("EXPENSE_APPROVAL_STATUS");
        }
        await tx
          .update(expense)
          .set({
            requiresApproval: false,
            approvedByUserId: actorUserId,
            approvedAt: new Date(),
          })
          .where(and(eq(expense.id, expenseId), eq(expense.workspaceId, workspaceId)));
        return this.loadExpense(tx, expenseId, workspaceId);
      },
    );
  }

  async reverse(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    options?: ExpenseViewOptions,
  ): Promise<StoredExpense> {
    return this.updateStatus(
      workspaceId,
      expenseId,
      actorUserId,
      "reversed",
      ["draft", "submitted", "posted"],
      "reverse",
      options,
    );
  }

  async updateVisibility(
    workspaceId: string,
    expenseId: string,
    visibility: "shared" | "private" | "company",
    actorUserId: string,
    options?: ExpenseViewOptions,
  ): Promise<StoredExpense> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const stored = await this.loadExpense(tx, expenseId, workspaceId);
        assertCanMutateExpense(stored, actorUserId, "promote", options);
        const updated = await tx
          .update(expense)
          .set({
            visibility,
            requiresApproval: false,
            approvedByUserId: visibility === "company" ? actorUserId : null,
            approvedAt: visibility === "company" ? new Date() : null,
          })
          .where(and(eq(expense.id, expenseId), eq(expense.workspaceId, workspaceId)))
          .returning();
        if (!updated[0]) throw new Error("EXPENSE_NOT_FOUND");
        return this.loadExpense(tx, expenseId, workspaceId);
      },
    );
  }

  private async updateStatus(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
    nextStatus: StoredExpense["status"],
    allowedFrom: StoredExpense["status"][],
    action: "submit" | "post" | "reverse",
    options?: ExpenseViewOptions,
  ): Promise<StoredExpense> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const stored = await this.loadExpense(tx, expenseId, workspaceId);
        assertCanMutateExpense(stored, actorUserId, action, options);
        if (!allowedFrom.includes(stored.status)) {
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

    const items = await loadItems(tx, expenseId);
    return mapExpense(row, splits, payments, items);
  }
}
