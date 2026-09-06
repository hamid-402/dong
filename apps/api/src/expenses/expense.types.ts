import {
  allocateExpenseSplit,
  moneySchema,
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
  reverse(
    workspaceId: string,
    expenseId: string,
    actorUserId: string,
  ): Promise<StoredExpense>;
  updateVisibility?(
    workspaceId: string,
    expenseId: string,
    visibility: "shared" | "private" | "company",
    actorUserId: string,
  ): Promise<StoredExpense>;
};

export const EXPENSE_STORE = Symbol("EXPENSE_STORE");

export function assertExpenseMoney(total: Money): void {
  const parsed = moneySchema.safeParse(total);
  if (!parsed.success) {
    const currencyBad = total?.currency !== "IRR";
    throw new Error(currencyBad ? "EXPENSE_CURRENCY" : "EXPENSE_AMOUNT");
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
  if (input.splitMethod !== "itemized" && !input.participantUserIds?.length) {
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
  let participantUserIds = [
    ...new Set((input.participantUserIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ];

  try {
    if (input.splitMethod === "itemized") {
      if (!input.items?.length) throw new Error("SPLIT_ITEMS");
      splits = allocateExpenseSplit({
        total: input.total,
        splitMethod: "itemized",
        participantUserIds,
        items: input.items,
        tip: input.tip,
        tax: input.tax,
        discount: input.discount,
      });
      const derived = [...new Set(splits.map((line) => line.userId))];
      if (derived.length === 0) throw new Error("EXPENSE_PARTICIPANTS");
      if (participantUserIds.length === 0) participantUserIds = derived;
    } else {
      splits = allocateExpenseSplit({
        total: input.total,
        splitMethod: input.splitMethod,
        participantUserIds,
        splitLines: input.splitLines,
      });
    }
    paymentLines = normalizePaymentLines(
      input.total,
      input.paidByUserId,
      input.paymentLines,
    );
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
        SPLIT_ITEMS: "EXPENSE_SPLIT_ITEMS",
        SPLIT_ITEM_TOTAL: "EXPENSE_SPLIT_ITEM_TOTAL",
        SPLIT_ITEM_TITLE: "EXPENSE_SPLIT_ITEMS",
        SPLIT_ITEM_ASSIGNEES: "EXPENSE_SPLIT_ITEMS",
        SPLIT_DISCOUNT: "EXPENSE_SPLIT_ITEMS",
        PAYMENT_AMOUNT: "EXPENSE_PAYMENT_AMOUNT",
        PAYMENT_SUM: "EXPENSE_PAYMENT_SUM",
      };
      const mapped = map[error.message];
      if (mapped) throw new Error(mapped);
    }
    throw error;
  }

  const visibility = input.visibility ?? "shared";
  if (visibility === "private" && participantUserIds.length !== 1) {
    throw new Error("EXPENSE_PRIVATE_ASSIGNEE");
  }
  if (visibility === "company" && participantUserIds.length < 1) {
    throw new Error("EXPENSE_PARTICIPANTS");
  }

  return { participantUserIds, paymentLines, splits };
}

export function toExpenseSummary(expense: StoredExpense): ExpenseSummary {
  return {
    id: expense.id,
    workspaceId: expense.workspaceId,
    periodId: expense.periodId,
    outingId: expense.outingId,
    title: expense.title,
    status: expense.status,
    visibility: expense.visibility ?? "shared",
    total: expense.total,
    tip: expense.tip,
    tax: expense.tax,
    discount: expense.discount,
    paidByUserId: expense.paidByUserId,
    paymentLines: expense.paymentLines,
    splitMethod: expense.splitMethod,
    participantUserIds: expense.participantUserIds,
    splits: expense.splits,
    items: expense.items,
    categoryId: expense.categoryId,
    budgetId: expense.budgetId,
    requiresApproval: expense.requiresApproval,
    approvedByUserId: expense.approvedByUserId,
    approvedAt: expense.approvedAt,
    occurredOn: expense.occurredOn,
    createdAt: expense.createdAt,
    source: expense.source === "daily_ledger" ? "daily_ledger" : undefined,
  };
}

/** Private expenses are visible only to payer, assignee, and creator. */
export function canActorViewExpense(
  expense: Pick<
    StoredExpense,
    "visibility" | "paidByUserId" | "participantUserIds" | "createdByUserId" | "paymentLines"
  >,
  actorUserId: string,
): boolean {
  const visibility = expense.visibility ?? "shared";
  if (visibility !== "private") return true;
  if (expense.createdByUserId === actorUserId) return true;
  if (expense.paidByUserId === actorUserId) return true;
  if (expense.participantUserIds.includes(actorUserId)) return true;
  if (expense.paymentLines.some((line) => line.userId === actorUserId)) return true;
  return false;
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
