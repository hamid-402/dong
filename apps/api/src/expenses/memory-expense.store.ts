import type { CreateExpenseDraftRequest, ExpenseSummary } from "@dang/contracts";
import {
  canActorViewExpense,
  toExpenseSummary,
  validateExpenseDraftInput,
  type ExpenseStore,
  type StoredExpense,
} from "./expense.types.js";

export class MemoryExpenseStore implements ExpenseStore {
  readonly persistence = "memory" as const;
  private readonly expenses = new Map<string, StoredExpense>();

  createDraft(
    actorUserId: string,
    input: CreateExpenseDraftRequest,
  ): Promise<StoredExpense> {
    const { participantUserIds, paymentLines, splits } =
      validateExpenseDraftInput(input);

    const id = crypto.randomUUID();
    const expense: StoredExpense = {
      id,
      workspaceId: input.workspaceId,
      periodId: input.periodId?.trim() || undefined,
      outingId: input.outingId?.trim() || undefined,
      title: input.title.trim(),
      status: "draft",
      visibility: input.visibility ?? "shared",
      total: input.total,
      tip: input.tip,
      tax: input.tax,
      discount: input.discount,
      paidByUserId: input.paidByUserId.trim(),
      paymentLines,
      splitMethod: input.splitMethod,
      participantUserIds,
      splits,
      items:
        input.splitMethod === "itemized" && input.items
          ? input.items.map((item, index) => ({
              ...item,
              lineNo: index + 1,
              id: crypto.randomUUID(),
            }))
          : undefined,
      categoryId: input.categoryId?.trim() || undefined,
      budgetId: input.budgetId?.trim() || undefined,
      requiresApproval:
        input.requiresApproval ?? (input.visibility === "company"),
      occurredOn: input.occurredOn,
      createdAt: new Date().toISOString(),
      note: input.note?.trim() || undefined,
      source: input.source === "daily_ledger" ? "daily_ledger" : undefined,
      idempotencyKey: input.idempotencyKey.trim(),
      createdByUserId: actorUserId,
    };
    this.expenses.set(id, expense);
    return Promise.resolve(expense);
  }

  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ExpenseSummary[]> {
    const result: ExpenseSummary[] = [];
    for (const expense of this.expenses.values()) {
      if (expense.workspaceId !== workspaceId) continue;
      if (!canActorViewExpense(expense, actorUserId)) continue;
      result.push(toExpenseSummary(expense));
    }
    return Promise.resolve(result);
  }

  submit(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense> {
    void actorUserId;
    const existing = this.expenses.get(expenseId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("EXPENSE_NOT_FOUND"));
    }
    if (existing.status !== "draft") {
      return Promise.reject(new Error("EXPENSE_STATUS"));
    }
    const updated: StoredExpense = { ...existing, status: "submitted" };
    this.expenses.set(expenseId, updated);
    return Promise.resolve(updated);
  }

  post(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense> {
    void actorUserId;
    const existing = this.expenses.get(expenseId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("EXPENSE_NOT_FOUND"));
    }
    if (existing.status !== "draft" && existing.status !== "submitted") {
      return Promise.reject(new Error("EXPENSE_STATUS"));
    }
    const updated: StoredExpense = { ...existing, status: "posted" };
    this.expenses.set(expenseId, updated);
    return Promise.resolve(updated);
  }

  reverse(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense> {
    void actorUserId;
    const existing = this.expenses.get(expenseId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("EXPENSE_NOT_FOUND"));
    }
    if (existing.status === "reversed") {
      return Promise.reject(new Error("EXPENSE_STATUS"));
    }
    const updated: StoredExpense = { ...existing, status: "reversed" };
    this.expenses.set(expenseId, updated);
    return Promise.resolve(updated);
  }

  updateVisibility(
    workspaceId: string,
    expenseId: string,
    visibility: "shared" | "private" | "company",
    actorUserId: string,
  ): Promise<StoredExpense> {
    void actorUserId;
    const existing = this.expenses.get(expenseId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return Promise.reject(new Error("EXPENSE_NOT_FOUND"));
    }
    const updated: StoredExpense = {
      ...existing,
      visibility,
      requiresApproval: false,
      approvedByUserId: visibility === "company" ? actorUserId : existing.approvedByUserId,
      approvedAt:
        visibility === "company" ? new Date().toISOString() : existing.approvedAt,
    };
    this.expenses.set(expenseId, updated);
    return Promise.resolve(updated);
  }
}
