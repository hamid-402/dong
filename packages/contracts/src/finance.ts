import type { Money } from "./money.js";

export type SplitMethod = "equal" | "amount" | "percent" | "shares" | "itemized";

export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "posted"
  | "reversed";

export type ExpenseAudience = "all_members" | "finance_and_creator";

export type CostCenterSummary = {
  id: string;
  workspaceId: string;
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
};

export type CreateCostCenterRequest = {
  name: string;
  code: string;
};

export type AllowancePeriodKind = "week" | "month";

export type MemberAllowanceSummary = {
  id: string;
  workspaceId: string;
  memberUserId: string;
  periodKind: AllowancePeriodKind;
  limit: Money;
  alertPct: number;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
};

export type CreateMemberAllowanceRequest = {
  memberUserId: string;
  periodKind: AllowancePeriodKind;
  limit: Money;
  alertPct?: number;
  idempotencyKey: string;
};

export type MemberAllowanceUsage = MemberAllowanceSummary & {
  periodStartsOn: string;
  spent: Money;
  remaining: Money;
  alertReached: boolean;
};

export type WorkspaceExpensePolicySummary = {
  workspaceId: string;
  approvalThresholdMinor: string | null;
  requireReceiptAboveMinor: string | null;
  updatedAt?: string;
  updatedByUserId?: string;
};

export type UpdateWorkspaceExpensePolicyRequest = {
  approvalThresholdMinor: string | null;
  requireReceiptAboveMinor: string | null;
};

export type ApprovalQueueItem = {
  kind: "addon_charge" | "member_invoice" | "expense";
  id: string;
  title: string;
  amount?: Money;
  status: string;
  hrefHint: string;
  createdAt: string;
};

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

/** Line on an itemized bill (lunch receipt). */
export type ExpenseItemInput = {
  title: string;
  /** IRR minor for this line. */
  amount: Money;
  /** Who consumes this item (shared appetizer = multiple). */
  assigneeUserIds: string[];
  /** Optional relative shares among assignees; default 1 each. */
  sharesByUserId?: Record<string, number>;
  notes?: string;
};

export type ExpenseItemSummary = ExpenseItemInput & {
  id?: string;
  lineNo?: number;
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
  /** Required for itemized method (lunch receipt). */
  items?: ExpenseItemInput[];
  tip?: Money;
  tax?: Money;
  discount?: Money;
  occurredOn: string;
  idempotencyKey: string;
  /** Optional link to a day/week/month expense period. */
  periodId?: string;
  /** Optional multi-expense outing container. */
  outingId?: string;
  categoryId?: string;
  costCenterId?: string;
  budgetId?: string;
  /** When true (company default), post requires approver role. */
  requiresApproval?: boolean;
  /** shared = جمعی؛ private = خصوصی من؛ company = خرج جاری شرکت/تیم. */
  visibility?: "shared" | "private" | "company";
  /** all_members by default; restricted items remain visible to creator and finance managers. */
  audience?: ExpenseAudience;
  /**
   * System provenance — set by daily ledger (and similar) creators.
   * Omitted/null = classic expense UI.
   */
  source?: "daily_ledger" | null;
  /** Preserved source money only; reporting/ledger total remains IRR. */
  originalCurrency?: string;
  originalAmountMinor?: string;
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
  items?: readonly ExpenseItemInput[];
  tip?: Money;
  tax?: Money;
  discount?: Money;
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
    case "itemized": {
      if (!input.items?.length) throw new Error("SPLIT_ITEMS");
      const result = allocateItemizedSplit({
        items: input.items,
        tip: input.tip,
        tax: input.tax,
        discount: input.discount,
      });
      if (result.total.amountMinor !== input.total.amountMinor) {
        throw new Error("SPLIT_ITEM_TOTAL");
      }
      return result.splits;
    }
    default:
      throw new Error("SPLIT_METHOD");
  }
}

/**
 * Itemized bill: each line assigned to one or more people; tip/tax/discount
 * distributed proportional to item subtotals.
 */
export function allocateItemizedSplit(input: {
  items: readonly ExpenseItemInput[];
  tip?: Money;
  tax?: Money;
  discount?: Money;
}): { total: Money; splits: ExpenseSplitLine[]; itemsSubtotal: Money } {
  if (!input.items.length) throw new Error("SPLIT_ITEMS");
  const aggregates = new Map<string, bigint>();
  let itemsSubtotal = 0n;

  for (const item of input.items) {
    if (!item.title?.trim()) throw new Error("SPLIT_ITEM_TITLE");
    if (item.amount.currency !== "IRR" || !/^\d+$/.test(item.amount.amountMinor)) {
      throw new Error("SPLIT_AMOUNT");
    }
    const amount = BigInt(item.amount.amountMinor);
    if (amount <= 0n) throw new Error("SPLIT_AMOUNT");
    const assignees = [...new Set(item.assigneeUserIds.map((id) => id.trim()).filter(Boolean))];
    if (assignees.length === 0) throw new Error("SPLIT_ITEM_ASSIGNEES");
    const weights = assignees.map((userId) => {
      const share = item.sharesByUserId?.[userId] ?? 1;
      if (!Number.isInteger(share) || share <= 0) throw new Error("SPLIT_SHARES");
      return { userId, weight: BigInt(share) };
    });
    const lines = distributeRemainder(item.amount, weights);
    for (const line of lines) {
      const prev = aggregates.get(line.userId) ?? 0n;
      aggregates.set(line.userId, prev + BigInt(line.amount.amountMinor));
    }
    itemsSubtotal += amount;
  }

  const tip = optionalMinor(input.tip);
  const tax = optionalMinor(input.tax);
  const discount = optionalMinor(input.discount);
  if (discount > itemsSubtotal + tip + tax) throw new Error("SPLIT_DISCOUNT");

  const extras = tip + tax - discount;
  if (extras !== 0n && aggregates.size > 0) {
    const entries = [...aggregates.entries()];
    const weightSum = entries.reduce((acc, [, v]) => acc + v, 0n) || BigInt(entries.length);
    let allocated = 0n;
    const extrasParts = entries.map(([userId, base]) => {
      const part =
        extras >= 0n
          ? (extras * base) / weightSum
          : -((-extras * base) / weightSum);
      allocated += part;
      return { userId, part };
    });
    let rem = extras - allocated;
    for (const row of extrasParts) {
      if (rem === 0n) break;
      const step = rem > 0n ? 1n : -1n;
      row.part += step;
      rem -= step;
    }
    for (const row of extrasParts) {
      aggregates.set(row.userId, (aggregates.get(row.userId) ?? 0n) + row.part);
    }
  }

  const totalMinor = itemsSubtotal + tip + tax - discount;
  if (totalMinor <= 0n) throw new Error("SPLIT_AMOUNT");

  const splits: ExpenseSplitLine[] = [...aggregates.entries()]
    .filter(([, amount]) => amount > 0n)
    .map(([userId, amountMinor]) => ({
      userId,
      amount: { amountMinor: amountMinor.toString(), currency: "IRR" as const },
    }));

  const sum = splits.reduce((acc, line) => acc + BigInt(line.amount.amountMinor), 0n);
  if (sum !== totalMinor) {
    // Fix rounding drift on first line
    const first = splits[0];
    if (!first) throw new Error("SPLIT_PARTICIPANTS");
    const drift = totalMinor - sum;
    first.amount = {
      amountMinor: (BigInt(first.amount.amountMinor) + drift).toString(),
      currency: "IRR",
    };
  }

  return {
    total: { amountMinor: totalMinor.toString(), currency: "IRR" },
    itemsSubtotal: { amountMinor: itemsSubtotal.toString(), currency: "IRR" },
    splits,
  };
}

function optionalMinor(money: Money | undefined): bigint {
  if (!money) return 0n;
  if (money.currency !== "IRR" || !/^\d+$/.test(money.amountMinor)) {
    throw new Error("SPLIT_AMOUNT");
  }
  return BigInt(money.amountMinor);
}

export type ExpenseSummary = {
  id: string;
  workspaceId: string;
  periodId?: string;
  outingId?: string;
  title: string;
  status: ExpenseStatus;
  visibility: "shared" | "private" | "company";
  audience?: ExpenseAudience;
  total: Money;
  tip?: Money;
  tax?: Money;
  discount?: Money;
  paidByUserId: string;
  paymentLines: ExpensePaymentLine[];
  splitMethod: SplitMethod;
  participantUserIds: string[];
  splits: ExpenseSplitLine[];
  items?: ExpenseItemSummary[];
  categoryId?: string;
  costCenterId?: string;
  budgetId?: string;
  requiresApproval?: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  occurredOn: string;
  createdAt: string;
  /** Present when created via daily ledger (or similar). */
  source?: "daily_ledger";
  originalCurrency?: string;
  originalAmountMinor?: string;
  fxRateId?: string;
};

export type CreateOutingRequest = {
  title: string;
  occurredOn: string;
  note?: string;
  idempotencyKey: string;
};

export type OutingSummary = {
  id: string;
  workspaceId: string;
  title: string;
  note?: string;
  occurredOn: string;
  createdByUserId: string;
  createdAt: string;
  expenseIds: string[];
  total: Money;
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
  status: "posted" | "reversed";
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

/** First-class debt-simplification payload (Dong 2.0 Wave 3). */
export type DebtSimplifySuggestionsResponse = {
  workspaceId: string;
  currency: "IRR";
  lines: BalanceLine[];
  suggestions: SettlementSuggestion[];
  /** True when suggestions satisfy the three golden rules. */
  goldenRulesOk: boolean;
  zeroSum: boolean;
};

/** Apply greedy suggestions as settlement claims (does not auto-confirm). */
export type CreateSimplifySettlementClaimsRequest = {
  idempotencyKey: string;
};

export type CreateSimplifySettlementClaimsResponse = {
  workspaceId: string;
  created: SettlementSummary[];
  skipped: number;
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

/** Minimal transfer suggestions: debtors pay creditors until nets clear. */
export type SettlementSuggestion = {
  fromUserId: string;
  toUserId: string;
  amount: Money;
};

export function suggestMinimalSettlements(
  lines: readonly BalanceLine[],
): SettlementSuggestion[] {
  const debtors: Array<{ userId: string; amount: bigint }> = [];
  const creditors: Array<{ userId: string; amount: bigint }> = [];
  for (const line of lines) {
    const net = BigInt(line.net.amountMinor);
    if (net > 0n) creditors.push({ userId: line.userId, amount: net });
    else if (net < 0n) debtors.push({ userId: line.userId, amount: -net });
  }
  debtors.sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
  creditors.sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));

  const suggestions: SettlementSuggestion[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const pay = debtor.amount < creditor.amount ? debtor.amount : creditor.amount;
    if (pay > 0n) {
      suggestions.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: { amountMinor: pay.toString(), currency: "IRR" },
      });
    }
    debtor.amount -= pay;
    creditor.amount -= pay;
    if (debtor.amount === 0n) i += 1;
    if (creditor.amount === 0n) j += 1;
  }
  return suggestions;
}

/**
 * Dong 2.0 golden checks for greedy debt simplification.
 * Interprets “no new debtor→debtor edges” as: every suggestion is debtor→creditor
 * relative to the input nets (never creditor→anyone, never debtor→debtor).
 */
export function settlementSuggestionsSatisfyGoldenRules(
  lines: readonly BalanceLine[],
  suggestions: readonly SettlementSuggestion[],
): boolean {
  const netByUser = new Map<string, bigint>();
  for (const line of lines) {
    netByUser.set(line.userId, BigInt(line.net.amountMinor));
  }
  if (!isZeroSumBalances(lines)) return false;

  const delta = new Map<string, bigint>();
  for (const userId of netByUser.keys()) delta.set(userId, 0n);

  for (const s of suggestions) {
    const pay = BigInt(s.amount.amountMinor);
    if (pay <= 0n) return false;
    const fromNet = netByUser.get(s.fromUserId) ?? 0n;
    const toNet = netByUser.get(s.toUserId) ?? 0n;
    // from must be a debtor (net < 0), to a creditor (net > 0)
    if (fromNet >= 0n || toNet <= 0n) return false;
    delta.set(s.fromUserId, (delta.get(s.fromUserId) ?? 0n) + pay);
    delta.set(s.toUserId, (delta.get(s.toUserId) ?? 0n) - pay);
  }

  for (const [userId, net] of netByUser) {
    const change = delta.get(userId) ?? 0n;
    // After paying |net| if debtor (net negative: paying increases net toward 0)
    // debtor net=-50, pays 50 → effective remaining net = -50+50=0
    // creditor net=+50, receives 50 → remaining = +50-50=0
    if (net + change !== 0n) return false;
  }
  return true;
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
