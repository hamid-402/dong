import type { CreateExpenseDraftRequest, ExpenseSummary } from "@dang/contracts";
import {
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
      title: input.title.trim(),
      status: "draft",
      total: input.total,
      paidByUserId: input.paidByUserId.trim(),
      paymentLines,
      splitMethod: input.splitMethod,
      participantUserIds,
      splits,
      occurredOn: input.occurredOn,
      createdAt: new Date().toISOString(),
      note: input.note?.trim() || undefined,
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
    void actorUserId;
    const result: ExpenseSummary[] = [];
    for (const expense of this.expenses.values()) {
      if (expense.workspaceId !== workspaceId) continue;
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
}
