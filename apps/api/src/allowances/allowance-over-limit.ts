import type {
  ExpenseSummary,
  MemberAllowanceSummary,
} from "@dang/contracts";

export function allowancePeriodRange(
  kind: "week" | "month",
  now = new Date(),
): { startsOn: string; endsOn: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  if (kind === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  } else {
    const weekday = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - ((weekday + 6) % 7));
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  }
  return {
    startsOn: start.toISOString().slice(0, 10),
    endsOn: end.toISOString().slice(0, 10),
  };
}

function memberParticipates(
  expense: Pick<
    ExpenseSummary,
    "paidByUserId" | "splits" | "status" | "occurredOn"
  >,
  memberUserId: string,
): boolean {
  if (expense.status === "reversed") return false;
  return (
    expense.paidByUserId === memberUserId ||
    expense.splits.some((line) => line.userId === memberUserId)
  );
}

/**
 * Posted usage in the allowance period plus `addedMinor` would exceed any active limit.
 */
export function evaluateAllowanceOverLimit(input: {
  allowances: readonly MemberAllowanceSummary[];
  expenses: readonly ExpenseSummary[];
  memberUserId: string;
  addedMinor: string;
  occurredOn: string;
  now?: Date;
}): { overLimit: boolean; limitMinor?: string } {
  const add = BigInt(input.addedMinor);
  for (const allowance of input.allowances) {
    if (!allowance.active || allowance.memberUserId !== input.memberUserId) {
      continue;
    }
    const { startsOn, endsOn } = allowancePeriodRange(
      allowance.periodKind,
      input.now,
    );
    if (input.occurredOn < startsOn || input.occurredOn > endsOn) continue;

    const spent = input.expenses.reduce((sum, expense) => {
      if (expense.status !== "posted") return sum;
      if (expense.occurredOn < startsOn || expense.occurredOn > endsOn) return sum;
      if (!memberParticipates(expense, input.memberUserId)) return sum;
      return sum + BigInt(expense.total.amountMinor);
    }, 0n);
    const limit = BigInt(allowance.limit.amountMinor);
    if (spent + add > limit) {
      return { overLimit: true, limitMinor: allowance.limit.amountMinor };
    }
  }
  return { overLimit: false };
}
