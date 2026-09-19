import type { ExpenseSummary, SplitMethod } from "./finance.js";
import { weekdayFaSatFirst, weekdayUtc } from "./daily-ledger.js";
import { actorExpenseSlice, sumActorExpensesInRange } from "./personal-finance.js";

/** Parse money minor units; non-integer / empty → 0n so statement list never 500s. */
export function parseMinorBigInt(
  value: string | number | bigint | null | undefined,
): bigint {
  if (typeof value === "bigint") return value;
  if (value == null) return 0n;
  const s = String(value).trim();
  if (!/^-?\d+$/.test(s)) return 0n;
  return BigInt(s);
}

/** Statement list granularity (S11-08). */
export type StatementGranularity = "day" | "period";

/** Export file formats — PDF is browser print, not a server format. */
export type StatementExportFormat = "csv" | "json";

export type StatementExportStatus = "pending" | "ready" | "failed";

/**
 * Workspace receiving-account instructions for statement print/settlement.
 * Not PSP card custody — never used on payment-link payloads.
 */
export type WorkspacePayoutInstructions = {
  holderName: string;
  destinationKind: "card" | "iban";
  destinationValue: string;
  bankName?: string;
  updatedAt?: string;
  updatedByUserId?: string;
};

export type UpsertWorkspacePayoutInstructionsRequest = {
  holderName: string;
  destinationKind: "card" | "iban";
  destinationValue: string;
  bankName?: string;
};

/**
 * One statement line at item/share level.
 * Optional catalog fields appear when the source expense/item carried them.
 */
export type StatementLine = {
  date: string;
  /** Persian weekday (شنبه…جمعه) from UTC calendar date. */
  weekdayFa: string;
  itemName: string;
  catalogItemId?: string;
  unitCode?: string;
  quantity?: number;
  unitPriceMinor?: string;
  /** Item or expense total in IRR minor. */
  totalMinor: string;
  /** shareMinor / totalMinor as a decimal string (e.g. "0.5"). */
  shareRatio: string;
  shareMinor: string;
  expenseId: string;
  splitMethod: SplitMethod;
  /** Payer user id (expense.paidByUserId). */
  paidBy: string;
};

/**
 * Share vs paid-as-payer in the statement range (not full workspace settlement).
 * Exactly one of payable/credit is positive; both may be zero when equal.
 */
export type StatementBalances = {
  /** max(0, share − paid) — suggested amount to transfer for this range. */
  payableMinor: string;
  /** max(0, paid − share) — member is net creditor in this range. */
  creditMinor: string;
};

export type MemberStatementSummary = {
  userId: string;
  from: string;
  to: string;
  granularity: StatementGranularity;
  totalShareMinor: string;
  totalPaidMinor: string;
  payableMinor: string;
  creditMinor: string;
  lineCount: number;
  /** Present when granularity=day — one bucket per calendar day with activity. */
  days?: Array<{
    date: string;
    shareMinor: string;
    lineCount: number;
  }>;
};

export type MemberStatementDetail = {
  workspaceId: string;
  userId: string;
  from: string;
  to: string;
  currency: "IRR";
  lines: StatementLine[];
  totalShareMinor: string;
  totalPaidMinor: string;
  payableMinor: string;
  creditMinor: string;
  /** True when Σ line.shareMinor equals Σ actorExpenseSlice share in range. */
  zeroSumOk: boolean;
  /**
   * Workspace payout destination when configured; null when unset.
   * Attached by API — builder leaves undefined/null.
   */
  payoutInstructions?: WorkspacePayoutInstructions | null;
};

export type WorkspaceStatementsResponse = {
  workspaceId: string;
  from: string;
  to: string;
  granularity: StatementGranularity;
  members: MemberStatementSummary[];
};

export type CreateStatementExportRequest = {
  from: string;
  to: string;
  format: StatementExportFormat;
};

export type StatementExportSummary = {
  id: string;
  workspaceId: string;
  subjectUserId: string;
  from: string;
  to: string;
  format: StatementExportFormat;
  status: StatementExportStatus;
  rowCount: number;
  /** Relative download path when ready. */
  downloadPath?: string;
  requestedByUserId: string;
  createdAt: string;
  completedAt?: string;
  errorDetail?: string;
  /** ISO expiry for export body retention (7d default). */
  expiresAt?: string;
};

function ratioString(shareMinor: bigint, totalMinor: bigint): string {
  if (totalMinor <= 0n) return "0";
  // Fixed 6 decimal places from integer milliparts.
  const milliparts = (shareMinor * 1_000_000n) / totalMinor;
  const whole = milliparts / 1_000_000n;
  const frac = (milliparts % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

function lineWeekdayFa(isoDate: string): string {
  return weekdayFaSatFirst(weekdayUtc(isoDate));
}

/** Honest share-vs-paid balances for a statement range. */
export function computeStatementBalances(
  totalShareMinor: string,
  totalPaidMinor: string,
): StatementBalances {
  const share = parseMinorBigInt(totalShareMinor);
  const paid = parseMinorBigInt(totalPaidMinor);
  if (share > paid) {
    return { payableMinor: (share - paid).toString(), creditMinor: "0" };
  }
  if (paid > share) {
    return { payableMinor: "0", creditMinor: (paid - share).toString() };
  }
  return { payableMinor: "0", creditMinor: "0" };
}

function itemShareForUser(
  item: NonNullable<ExpenseSummary["items"]>[number],
  userId: string,
): bigint {
  const assignees = [
    ...new Set(item.assigneeUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!assignees.includes(userId)) return 0n;
  const totalMinor = parseMinorBigInt(item.amount.amountMinor);
  const weights = assignees.map((id) => {
    const share = item.sharesByUserId?.[id] ?? 1;
    return { userId: id, weight: BigInt(Math.max(1, Math.trunc(share))) };
  });
  const weightSum = weights.reduce((acc, w) => acc + w.weight, 0n);
  if (weightSum <= 0n) return 0n;

  let allocated = 0n;
  const parts = weights.map((w) => {
    const amount = (totalMinor * w.weight) / weightSum;
    allocated += amount;
    return { userId: w.userId, amount };
  });
  let remainder = totalMinor - allocated;
  for (const part of parts) {
    if (remainder <= 0n) break;
    part.amount += 1n;
    remainder -= 1n;
  }
  return parts.find((p) => p.userId === userId)?.amount ?? 0n;
}

/**
 * Build item/share-level statement lines for one posted expense and one member.
 * Reconciles to {@link actorExpenseSlice}.shareMinor so zero-sum holds.
 */
export function buildMemberStatementLines(
  expense: ExpenseSummary,
  userId: string,
  from: string,
  to: string,
): StatementLine[] {
  const slice = actorExpenseSlice(expense, userId, from, to);
  if (slice.shareMinor === 0n && !slice.counted) {
    return [];
  }
  if (slice.shareMinor === 0n) {
    return [];
  }

  const paidBy = expense.paidByUserId;
  const lines: StatementLine[] = [];

  if (
    expense.splitMethod === "itemized" &&
    expense.items &&
    expense.items.length > 0
  ) {
    for (const item of expense.items) {
      const shareMinor = itemShareForUser(item, userId);
      if (shareMinor <= 0n) continue;
      const totalMinor = item.amount.amountMinor;
      lines.push({
        date: expense.occurredOn,
        weekdayFa: lineWeekdayFa(expense.occurredOn),
        itemName: item.title.trim() || expense.title,
        catalogItemId: item.catalogItemId,
        unitCode: item.unitCode,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalMinor,
        shareRatio: ratioString(shareMinor, parseMinorBigInt(totalMinor)),
        shareMinor: shareMinor.toString(),
        expenseId: expense.id,
        splitMethod: expense.splitMethod,
        paidBy,
      });
    }

    // Tip / tax / discount (and any drift vs stored splits) as adjustment lines.
    const itemsShare = lines.reduce(
      (acc, line) => acc + parseMinorBigInt(line.shareMinor),
      0n,
    );
    const adjustment = slice.shareMinor - itemsShare;
    if (adjustment !== 0n) {
      const adjTotal =
        (expense.tip ? parseMinorBigInt(expense.tip.amountMinor) : 0n) +
        (expense.tax ? parseMinorBigInt(expense.tax.amountMinor) : 0n) -
        (expense.discount ? parseMinorBigInt(expense.discount.amountMinor) : 0n);
      const totalForRatio =
        adjTotal !== 0n ? (adjTotal > 0n ? adjTotal : -adjTotal) : expense.total.amountMinor;
      lines.push({
        date: expense.occurredOn,
        weekdayFa: lineWeekdayFa(expense.occurredOn),
        itemName:
          adjustment > 0n
            ? `تعدیل (انعام/مالیات) — ${expense.title}`
            : `تعدیل (تخفیف) — ${expense.title}`,
        totalMinor: totalForRatio.toString(),
        shareRatio: ratioString(
          adjustment > 0n ? adjustment : -adjustment,
          parseMinorBigInt(totalForRatio),
        ),
        shareMinor: adjustment.toString(),
        expenseId: expense.id,
        splitMethod: expense.splitMethod,
        paidBy,
      });
    }
  } else {
    const totalMinor = expense.total.amountMinor;
    lines.push({
      date: expense.occurredOn,
      weekdayFa: lineWeekdayFa(expense.occurredOn),
      itemName: expense.title,
      catalogItemId: expense.catalogItemId,
      unitCode: expense.unitCode,
      quantity: expense.quantity,
      unitPriceMinor: expense.unitPriceMinor,
      totalMinor,
      shareRatio: ratioString(slice.shareMinor, parseMinorBigInt(totalMinor)),
      shareMinor: slice.shareMinor.toString(),
      expenseId: expense.id,
      splitMethod: expense.splitMethod,
      paidBy,
    });
  }

  return lines;
}

export function sumStatementShareMinor(lines: readonly StatementLine[]): bigint {
  return lines.reduce((acc, line) => acc + parseMinorBigInt(line.shareMinor), 0n);
}

/**
 * Golden rule: Σ statement shareMinor === Σ member expense shares in range.
 */
export function statementZeroSumHolds(
  expenses: readonly ExpenseSummary[],
  userId: string,
  from: string,
  to: string,
  lines: readonly StatementLine[],
): boolean {
  const expected = sumActorExpensesInRange(expenses, userId, from, to).share;
  return sumStatementShareMinor(lines) === parseMinorBigInt(expected.amountMinor);
}

export function buildMemberStatementDetail(input: {
  workspaceId: string;
  userId: string;
  from: string;
  to: string;
  expenses: readonly ExpenseSummary[];
}): MemberStatementDetail {
  const lines: StatementLine[] = [];
  for (const expense of input.expenses) {
    lines.push(
      ...buildMemberStatementLines(
        expense,
        input.userId,
        input.from,
        input.to,
      ),
    );
  }
  lines.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.expenseId.localeCompare(b.expenseId);
  });

  const range = sumActorExpensesInRange(
    input.expenses,
    input.userId,
    input.from,
    input.to,
  );
  const totalShareMinor = sumStatementShareMinor(lines).toString();
  const totalPaidMinor = range.paid.amountMinor;
  const balances = computeStatementBalances(totalShareMinor, totalPaidMinor);

  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    from: input.from,
    to: input.to,
    currency: "IRR",
    lines,
    totalShareMinor,
    totalPaidMinor,
    payableMinor: balances.payableMinor,
    creditMinor: balances.creditMinor,
    zeroSumOk: totalShareMinor === range.share.amountMinor,
    payoutInstructions: null,
  };
}

export function summarizeMemberStatement(
  detail: MemberStatementDetail,
  granularity: StatementGranularity,
): MemberStatementSummary {
  const balances = computeStatementBalances(
    detail.totalShareMinor,
    detail.totalPaidMinor,
  );
  const base: MemberStatementSummary = {
    userId: detail.userId,
    from: detail.from,
    to: detail.to,
    granularity,
    totalShareMinor: detail.totalShareMinor,
    totalPaidMinor: detail.totalPaidMinor,
    payableMinor: detail.payableMinor ?? balances.payableMinor,
    creditMinor: detail.creditMinor ?? balances.creditMinor,
    lineCount: detail.lines.length,
  };
  if (granularity !== "day") return base;

  const byDay = new Map<string, { shareMinor: bigint; lineCount: number }>();
  for (const line of detail.lines) {
    const bucket = byDay.get(line.date) ?? { shareMinor: 0n, lineCount: 0 };
    bucket.shareMinor += parseMinorBigInt(line.shareMinor);
    bucket.lineCount += 1;
    byDay.set(line.date, bucket);
  }
  base.days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => ({
      date,
      shareMinor: bucket.shareMinor.toString(),
      lineCount: bucket.lineCount,
    }));
  return base;
}

export function statementLinesToCsv(lines: readonly StatementLine[]): string {
  const header = [
    "date",
    "weekdayFa",
    "itemName",
    "catalogItemId",
    "unitCode",
    "quantity",
    "unitPriceMinor",
    "totalMinor",
    "shareRatio",
    "shareMinor",
    "expenseId",
    "splitMethod",
    "paidBy",
  ].join(",");

  const escape = (value: string): string => {
    if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
    return value;
  };

  const rows = lines.map((line) =>
    [
      line.date,
      escape(line.weekdayFa),
      escape(line.itemName),
      line.catalogItemId ?? "",
      line.unitCode ?? "",
      line.quantity === undefined ? "" : String(line.quantity),
      line.unitPriceMinor ?? "",
      line.totalMinor,
      line.shareRatio,
      line.shareMinor,
      line.expenseId,
      line.splitMethod,
      line.paidBy,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

/** Full statement CSV including totals footer and payout meta when present. */
export function statementDetailToCsv(detail: MemberStatementDetail): string {
  const body = statementLinesToCsv(detail.lines);
  const footer = [
    "",
    `# totalShareMinor=${detail.totalShareMinor}`,
    `# totalPaidMinor=${detail.totalPaidMinor}`,
    `# payableMinor=${detail.payableMinor}`,
    `# creditMinor=${detail.creditMinor}`,
    `# zeroSumOk=${detail.zeroSumOk}`,
  ];
  const payout = detail.payoutInstructions;
  if (payout) {
    footer.push(
      `# payout.holderName=${payout.holderName}`,
      `# payout.destinationKind=${payout.destinationKind}`,
      `# payout.destinationValue=${payout.destinationValue}`,
    );
    if (payout.bankName) footer.push(`# payout.bankName=${payout.bankName}`);
  } else {
    footer.push("# payoutInstructions=unset");
  }
  return `${body}\n${footer.join("\n")}\n`;
}

export function statementDetailToJson(detail: MemberStatementDetail): string {
  return `${JSON.stringify(detail, null, 2)}\n`;
}
