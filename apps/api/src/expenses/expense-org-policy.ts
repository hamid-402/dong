import type { ExpenseSummary } from "@dang/contracts";

/** Sum of non-reversed expenses for actor on a single occurredOn day (G09 #14). */
export function sumActorDailyExpenseMinor(
  expenses: readonly ExpenseSummary[],
  actorUserId: string,
  occurredOn: string,
  excludeExpenseId?: string,
): bigint {
  return expenses.reduce((sum, expense) => {
    if (expense.status === "reversed") return sum;
    if (expense.occurredOn !== occurredOn) return sum;
    if (excludeExpenseId && expense.id === excludeExpenseId) return sum;
    const participates =
      expense.paidByUserId === actorUserId ||
      expense.splits.some((line) => line.userId === actorUserId);
    return participates ? sum + BigInt(expense.total.amountMinor) : sum;
  }, 0n);
}

export function evaluatePerDiemRequiresApproval(input: {
  perDiemDailyMinor: string;
  expenses: readonly ExpenseSummary[];
  actorUserId: string;
  occurredOn: string;
  addedMinor: string;
  excludeExpenseId?: string;
}): boolean {
  const cap = BigInt(input.perDiemDailyMinor);
  const prior = sumActorDailyExpenseMinor(
    input.expenses,
    input.actorUserId,
    input.occurredOn,
    input.excludeExpenseId,
  );
  const add = BigInt(input.addedMinor);
  return prior + add > cap;
}
