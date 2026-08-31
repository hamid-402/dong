import type { Money } from "./money.js";

export type SplitMethod = "equal" | "amount" | "percent" | "shares";

export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "posted"
  | "reversed";

export type SettlementStatus =
  | "claimed"
  | "confirmed"
  | "disputed"
  | "cancelled";

export type ExpensePaymentLine = {
  userId: string;
  /** IRR minor units paid by this member. */
  amount: Money;
};

/** Phase 2 draft payload. */
export type CreateExpenseDraftRequest = {
  workspaceId: string;
  title: string;
  note?: string;
  /** Canonical IRR minor units. */
  total: Money;
  /** Primary payer — used when `paymentLines` is omitted. */
  paidByUserId: string;
  /** Optional multi-payer breakdown; must sum to `total`. */
  paymentLines?: ExpensePaymentLine[];
  splitMethod: SplitMethod;
  /** Participant user ids for equal split, or detailed lines for other methods. */
  participantUserIds: string[];
  /** Required for amount / percent / shares methods. */
  splitLines?: ExpenseSplitLine[];
  occurredOn: string;
  idempotencyKey: string;
};

export type ExpenseSplitLine = {
  userId: string;
  /** IRR minor share. */
  amount: Money;
  percent?: string;
  shares?: number;
};

/**
 * Equal split in IRR minor units. Remainder (1 rial each) goes to the first
 * participants so the lines always sum to `total`.
 */
function assertSplitTotal(total: Money): bigint {
  if (total.currency !== "IRR") {
    throw new Error("SPLIT_CURRENCY");
  }
  if (!/^-?\d+$/.test(total.amountMinor) || BigInt(total.amountMinor) <= 0n) {
    throw new Error("SPLIT_AMOUNT");
  }
  return BigInt(total.amountMinor);
}

function distributeRemainder(
  total: Money,
  lines: Array<{ userId: string; weight: bigint }>,
): ExpenseSplitLine[] {
  const totalMinor = assertSplitTotal(total);
  const weightSum = lines.reduce((acc, line) => acc + line.weight, 0n);
  if (weightSum <= 0n) {
    throw new Error("SPLIT_PARTICIPANTS");
  }

  let allocated = 0n;
  const baseLines = lines.map((line) => {
    const amount = (totalMinor * line.weight) / weightSum;
    allocated += amount;
    return {
      userId: line.userId,
      amountMinor: amount,
    };
  });

  let remainder = totalMinor - allocated;
  return baseLines.map((line) => {
    const extra = remainder > 0n ? 1n : 0n;
    if (remainder > 0n) remainder -= 1n;
    return {
      userId: line.userId,
      amount: {
        amountMinor: String(line.amountMinor + extra),
        currency: total.currency,
      },
    };
  });
}

export function allocateEqualSplit(
  total: Money,
  participantUserIds: readonly string[],
): ExpenseSplitLine[] {
  const unique = [...new Set(participantUserIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("SPLIT_PARTICIPANTS");
  }
  return distributeRemainder(
    total,
    unique.map((userId) => ({ userId, weight: 1n })),
  );
}

/** Explicit minor amounts must sum exactly to `total`. */
export function allocateAmountSplit(
  total: Money,
  lines: readonly Pick<ExpenseSplitLine, "userId" | "amount">[],
): ExpenseSplitLine[] {
  const totalMinor = assertSplitTotal(total);
  if (lines.length === 0) {
    throw new Error("SPLIT_PARTICIPANTS");
  }
  const unique = new Map<string, bigint>();
  for (const line of lines) {
    const userId = line.userId.trim();
    if (!userId) throw new Error("SPLIT_PARTICIPANTS");
    if (line.amount.currency !== "IRR" || !/^-?\d+$/.test(line.amount.amountMinor)) {
      throw new Error("SPLIT_AMOUNT");
    }
    const amount = BigInt(line.amount.amountMinor);
    if (amount <= 0n) throw new Error("SPLIT_AMOUNT");
    unique.set(userId, (unique.get(userId) ?? 0n) + amount);
  }
  const sum = [...unique.values()].reduce((acc, value) => acc + value, 0n);
  if (sum !== totalMinor) {
    throw new Error("SPLIT_SUM");
  }
  return [...unique.entries()].map(([userId, amountMinor]) => ({
    userId,
    amount: { amountMinor: amountMinor.toString(), currency: total.currency },
  }));
}

/** `percent` is basis points: 10000 = 100%. */
export function allocatePercentSplit(
  total: Money,
  lines: readonly Pick<ExpenseSplitLine, "userId" | "percent">[],
): ExpenseSplitLine[] {
  if (lines.length === 0) {
    throw new Error("SPLIT_PARTICIPANTS");
  }
  const weights = lines.map((line) => {
    const userId = line.userId.trim();
    if (!userId || !line.percent || !/^\d+$/.test(line.percent)) {
      throw new Error("SPLIT_PERCENT");
    }
    const bp = BigInt(line.percent);
    if (bp <= 0n) throw new Error("SPLIT_PERCENT");
    return { userId, weight: bp, percent: line.percent };
  });
  const weightSum = weights.reduce((acc, line) => acc + line.weight, 0n);
  if (weightSum !== 10000n) {
    throw new Error("SPLIT_PERCENT_SUM");
  }
  const allocated = distributeRemainder(
    total,
    weights.map((line) => ({ userId: line.userId, weight: line.weight })),
  );
  return allocated.map((line, index) => ({
    ...line,
    percent: weights[index]?.percent,
  }));
}

export function allocateSharesSplit(
  total: Money,
  lines: readonly Pick<ExpenseSplitLine, "userId" | "shares">[],
): ExpenseSplitLine[] {
  if (lines.length === 0) {
    throw new Error("SPLIT_PARTICIPANTS");
  }
  const weights = lines.map((line) => {
    const userId = line.userId.trim();
    if (!userId || !line.shares || !Number.isInteger(line.shares) || line.shares <= 0) {
      throw new Error("SPLIT_SHARES");
    }
    return { userId, weight: BigInt(line.shares), shares: line.shares };
  });
  const allocated = distributeRemainder(
    total,
    weights.map((line) => ({ userId: line.userId, weight: line.weight })),
  );
  return allocated.map((line, index) => ({
    ...line,
    shares: weights[index]?.shares,
  }));
}

export function normalizePaymentLines(
  total: Money,
  paidByUserId: string,
  paymentLines?: readonly ExpensePaymentLine[],
): ExpensePaymentLine[] {
  const totalMinor = assertSplitTotal(total);
  if (!paymentLines?.length) {
    return [{ userId: paidByUserId.trim(), amount: total }];
  }
  const merged = new Map<string, bigint>();
  for (const line of paymentLines) {
    const userId = line.userId.trim();
    if (!userId || line.amount.currency !== "IRR" || !/^-?\d+$/.test(line.amount.amountMinor)) {
      throw new Error("PAYMENT_AMOUNT");
    }
    const amount = BigInt(line.amount.amountMinor);
    if (amount <= 0n) throw new Error("PAYMENT_AMOUNT");
    merged.set(userId, (merged.get(userId) ?? 0n) + amount);
  }
  const sum = [...merged.values()].reduce((acc, value) => acc + value, 0n);
  if (sum !== totalMinor) {
    throw new Error("PAYMENT_SUM");
  }
  return [...merged.entries()].map(([userId, amountMinor]) => ({
    userId,
    amount: { amountMinor: amountMinor.toString(), currency: total.currency },
  }));
}

export function allocateExpenseSplit(input: {
  total: Money;
  splitMethod: SplitMethod;
  participantUserIds: string[];
  splitLines?: readonly ExpenseSplitLine[];
}): ExpenseSplitLine[] {
  switch (input.splitMethod) {
    case "equal":
      return allocateEqualSplit(input.total, input.participantUserIds);
    case "amount":
      if (!input.splitLines?.length) throw new Error("SPLIT_LINES");
      return allocateAmountSplit(input.total, input.splitLines);
    case "percent":
      if (!input.splitLines?.length) throw new Error("SPLIT_LINES");
      return allocatePercentSplit(input.total, input.splitLines);
    case "shares":
      if (!input.splitLines?.length) throw new Error("SPLIT_LINES");
      return allocateSharesSplit(input.total, input.splitLines);
    default:
      throw new Error("SPLIT_METHOD");
  }
}

export type ExpenseSummary = {
  id: string;
  workspaceId: string;
  title: string;
  status: ExpenseStatus;
  total: Money;
  paidByUserId: string;
  paymentLines: ExpensePaymentLine[];
  splitMethod: SplitMethod;
  participantUserIds: string[];
  splits: ExpenseSplitLine[];
  occurredOn: string;
  createdAt: string;
};

export type CreateSettlementClaimRequest = {
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  amount: Money;
  note?: string;
  /** Optional payment link recorded only — no custody. */
  paymentLinkUrl?: string;
  idempotencyKey: string;
};

export type SettlementSummary = {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  amount: Money;
  status: SettlementStatus;
  paymentLinkUrl?: string;
  createdAt: string;
};

/** Net balance line. Positive amountMinor => others owe this user. */
export type BalanceLine = {
  userId: string;
  net: Money;
};

export type JournalLineSide = "debit" | "credit";

export type JournalLine = {
  /** Soft account key, e.g. `member:{userId}`. */
  accountCode: string;
  userId: string;
  side: JournalLineSide;
  amount: Money;
};

export type JournalSourceType = "expense" | "settlement";

export type JournalEntrySummary = {
  id: string;
  workspaceId: string;
  sourceType: JournalSourceType;
  sourceId: string;
  status: "posted";
  currency: "IRR";
  lines: JournalLine[];
  idempotencyKey: string;
  actorUserId: string;
  createdAt: string;
};

export type WorkspaceBalancesResponse = {
  workspaceId: string;
  /** False when journal is persisted in Postgres with RLS. */
  provisional: boolean;
  source: "memory_journal" | "postgres_journal";
  currency: "IRR";
  lines: BalanceLine[];
  /** Sum of all nets must be zero for a consistent slice. */
  zeroSum: boolean;
};

type BalanceExpenseInput = Pick<
  ExpenseSummary,
  "id" | "paidByUserId" | "total" | "splits" | "paymentLines" | "status"
>;

type BalanceSettlementInput = Pick<
  SettlementSummary,
  "id" | "fromUserId" | "toUserId" | "amount" | "status"
>;

export function memberAccountCode(userId: string): string {
  return `member:${userId}`;
}

export function assertBalancedJournalLines(lines: readonly JournalLine[]): void {
  if (lines.length < 2) {
    throw new Error("JOURNAL_LINES");
  }
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    if (line.amount.currency !== "IRR" || !/^-?\d+$/.test(line.amount.amountMinor)) {
      throw new Error("JOURNAL_AMOUNT");
    }
    const amount = BigInt(line.amount.amountMinor);
    if (amount <= 0n) {
      throw new Error("JOURNAL_AMOUNT");
    }
    if (line.side === "debit") debit += amount;
    else credit += amount;
  }
  if (debit !== credit) {
    throw new Error("JOURNAL_UNBALANCED");
  }
}

/** Payer(s) credited; each participant debited for their share. */
export function buildExpenseJournalLines(
  expense: Pick<ExpenseSummary, "paidByUserId" | "total" | "splits" | "paymentLines">,
): JournalLine[] {
  const payers =
    expense.paymentLines?.length > 0
      ? expense.paymentLines
      : [{ userId: expense.paidByUserId, amount: expense.total }];

  const lines: JournalLine[] = payers.map((payer) => ({
    accountCode: memberAccountCode(payer.userId),
    userId: payer.userId,
    side: "credit",
    amount: payer.amount,
  }));

  for (const split of expense.splits) {
    lines.push({
      accountCode: memberAccountCode(split.userId),
      userId: split.userId,
      side: "debit",
      amount: split.amount,
    });
  }
  assertBalancedJournalLines(lines);
  return lines;
}

/** Confirmed settlement: debtor credited, creditor debited. */
export function buildSettlementJournalLines(
  settlement: Pick<SettlementSummary, "fromUserId" | "toUserId" | "amount">,
): JournalLine[] {
  const lines: JournalLine[] = [
    {
      accountCode: memberAccountCode(settlement.toUserId),
      userId: settlement.toUserId,
      side: "debit",
      amount: settlement.amount,
    },
    {
      accountCode: memberAccountCode(settlement.fromUserId),
      userId: settlement.fromUserId,
      side: "credit",
      amount: settlement.amount,
    },
  ];
  assertBalancedJournalLines(lines);
  return lines;
}

/**
 * Member net = credits − debits on `member:{userId}` accounts.
 * Positive => others owe this user.
 */
export function computeBalancesFromJournal(
  entries: readonly Pick<JournalEntrySummary, "lines" | "status">[],
): BalanceLine[] {
  const nets = new Map<string, bigint>();
  const add = (userId: string, delta: bigint) => {
    nets.set(userId, (nets.get(userId) ?? 0n) + delta);
  };

  for (const entry of entries) {
    if (entry.status !== "posted") continue;
    for (const line of entry.lines) {
      const amount = BigInt(line.amount.amountMinor);
      add(line.userId, line.side === "credit" ? amount : -amount);
    }
  }

  return [...nets.entries()]
    .filter(([, net]) => net !== 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, net]) => ({
      userId,
      net: { amountMinor: net.toString(), currency: "IRR" as const },
    }));
}

/**
 * Legacy projection from documents (kept for cross-check / tests).
 * Prefer `computeBalancesFromJournal` once entries exist.
 */
export function computeProvisionalBalances(
  expenses: readonly BalanceExpenseInput[],
  settlements: readonly BalanceSettlementInput[],
): BalanceLine[] {
  const nets = new Map<string, bigint>();

  const add = (userId: string, delta: bigint) => {
    nets.set(userId, (nets.get(userId) ?? 0n) + delta);
  };

  for (const expense of expenses) {
    if (expense.status !== "posted") continue;
    const payers =
      expense.paymentLines?.length > 0
        ? expense.paymentLines
        : [{ userId: expense.paidByUserId, amount: expense.total }];
    for (const payer of payers) {
      add(payer.userId, BigInt(payer.amount.amountMinor));
    }
    for (const line of expense.splits) {
      add(line.userId, -BigInt(line.amount.amountMinor));
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== "confirmed") continue;
    const amount = BigInt(settlement.amount.amountMinor);
    add(settlement.fromUserId, amount);
    add(settlement.toUserId, -amount);
  }

  return [...nets.entries()]
    .filter(([, net]) => net !== 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, net]) => ({
      userId,
      net: { amountMinor: net.toString(), currency: "IRR" as const },
    }));
}

export function isZeroSumBalances(lines: readonly BalanceLine[]): boolean {
  const sum = lines.reduce((acc, line) => acc + BigInt(line.net.amountMinor), 0n);
  return sum === 0n;
}

export const financeVerticalSliceSteps = [
  "invite_member",
  "create_expense",
  "attach_receipt",
  "add_comment",
  "allocate_split",
  "post_ledger",
  "compute_balance",
  "claim_settlement",
  "confirm_settlement",
  "notify_member",
] as const;

export type FinanceVerticalSliceStep = (typeof financeVerticalSliceSteps)[number];
