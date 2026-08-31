import {
  allocateExpenseSplit,
  normalizePaymentLines,
  type CreateExpenseDraftRequest,
  type ExpensePaymentLine,
  type ExpenseSplitLine,
  type ExpenseStatus,
  type ExpenseSummary,
  type Money,
  type SplitMethod,
} from "@dang/contracts";

export type StoredExpense = ExpenseSummary & {
  note?: string;
  idempotencyKey: string;
  createdByUserId: string;
};

export type ExpenseStore = {
  readonly persistence: "memory" | "postgres";
  createDraft(
    actorUserId: string,
    input: CreateExpenseDraftRequest,
  ): Promise<StoredExpense>;
  listForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<ExpenseSummary[]>;
  submit(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense>;
  post(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense>;
};

export const EXPENSE_STORE = Symbol("EXPENSE_STORE");

export function assertExpenseMoney(total: Money): void {
  if (total.currency !== "IRR") {
    throw new Error("EXPENSE_CURRENCY");
  }
  if (!/^-?\d+$/.test(total.amountMinor)) {
    throw new Error("EXPENSE_AMOUNT");
  }
  if (BigInt(total.amountMinor) <= 0n) {
    throw new Error("EXPENSE_AMOUNT");
  }
}

export function validateExpenseDraftInput(input: CreateExpenseDraftRequest): {
  participantUserIds: string[];
  paymentLines: ExpensePaymentLine[];
  splits: ExpenseSplitLine[];
} {
  assertExpenseMoney(input.total);
  if (!input.title?.trim() || input.title.trim().length > 120) {
    throw new Error("EXPENSE_TITLE");
  }
  if (!input.participantUserIds?.length) {
    throw new Error("EXPENSE_PARTICIPANTS");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error("EXPENSE_IDEMPOTENCY");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    throw new Error("EXPENSE_DATE");
  }
  if (!input.paidByUserId?.trim()) {
    throw new Error("EXPENSE_PAYER");
  }

  let paymentLines: ExpensePaymentLine[];
  let splits: ExpenseSplitLine[];
  try {
    paymentLines = normalizePaymentLines(
      input.total,
      input.paidByUserId,
      input.paymentLines,
    );
    splits = allocateExpenseSplit({
      total: input.total,
      splitMethod: input.splitMethod,
      participantUserIds: input.participantUserIds,
      splitLines: input.splitLines,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      const map: Record<string, string> = {
        SPLIT_CURRENCY: "EXPENSE_CURRENCY",
        SPLIT_AMOUNT: "EXPENSE_AMOUNT",
        SPLIT_PARTICIPANTS: "EXPENSE_PARTICIPANTS",
        SPLIT_SUM: "EXPENSE_SPLIT_SUM",
        SPLIT_PERCENT: "EXPENSE_SPLIT_PERCENT",
        SPLIT_PERCENT_SUM: "EXPENSE_SPLIT_PERCENT",
        SPLIT_SHARES: "EXPENSE_SPLIT_SHARES",
        SPLIT_LINES: "EXPENSE_SPLIT_LINES",
        SPLIT_METHOD: "EXPENSE_SPLIT_METHOD",
        PAYMENT_AMOUNT: "EXPENSE_PAYMENT_AMOUNT",
        PAYMENT_SUM: "EXPENSE_PAYMENT_SUM",
      };
      const mapped = map[error.message];
      if (mapped) {
        throw new Error(mapped);
      }
    }
    throw error;
  }

  return {
    participantUserIds: [...new Set(input.participantUserIds.map((id) => id.trim()))],
    paymentLines,
    splits,
  };
}

export function toExpenseSummary(expense: StoredExpense): ExpenseSummary {
  return {
    id: expense.id,
    workspaceId: expense.workspaceId,
    title: expense.title,
    status: expense.status,
    total: expense.total,
    paidByUserId: expense.paidByUserId,
    paymentLines: expense.paymentLines,
    splitMethod: expense.splitMethod,
    participantUserIds: expense.participantUserIds,
    splits: expense.splits,
    occurredOn: expense.occurredOn,
    createdAt: expense.createdAt,
  };
}

export function assertExpenseStatusTransition(
  current: ExpenseStatus,
  next: ExpenseStatus,
): void {
  const allowed: Record<ExpenseStatus, ExpenseStatus[]> = {
    draft: ["submitted", "posted"],
    submitted: ["posted"],
    posted: [],
    reversed: [],
  };
  if (!allowed[current].includes(next)) {
    throw new Error("EXPENSE_STATUS");
  }
}

export function asSplitMethod(value: string): SplitMethod {
  return value as SplitMethod;
}
