import type { Money } from "./money.js";
import type { ExpenseSummary } from "./finance.js";
import { normalizePaymentLines } from "./finance.js";

/** Actor cash outflow vs consumption share vs point-in-time group net. */
export type PersonalFinanceMetricFocus = "paid" | "share" | "net";

export type PersonalFinanceWorkspaceLine = {
  workspaceId: string;
  workspaceName: string;
  template: string;
  spaceKind: "personal" | "group" | "building" | "org";
  /** Sum of actor payment lines on posted expenses in range. */
  paid: Money;
  /** Sum of actor split lines on posted expenses in range. */
  share: Money;
  /** Current net vs peers in this workspace (ledger; not range-scoped). */
  net: Money;
  /** Posted expenses in range where actor paid or had a share. */
  expenseCount: number;
  /** Open settlements (claimed + disputed) visible to the actor in this workspace. */
  openSettlements: number;
};

export type PersonalFinanceOverviewResponse = {
  from: string;
  to: string;
  currency: "IRR";
  /** S11-10: which slice of totals/workspaces this response emphasizes. */
  scope?: PersonalFinanceOverviewScope;
  totals: {
    paid: Money;
    share: Money;
    /** Personal money_txn income in range (when scope includes personal). */
    personalIncome?: Money;
    /** Personal money_txn expenses in range (when scope includes personal). */
    personalExpense?: Money;
  };
  workspaces: PersonalFinanceWorkspaceLine[];
  source: {
    expense: "memory" | "postgres";
    ledger: "memory" | "postgres";
    personal?: "memory" | "postgres";
  };
};

export function irrMoney(amountMinor: string | bigint): Money {
  return {
    amountMinor: typeof amountMinor === "bigint" ? amountMinor.toString() : amountMinor,
    currency: "IRR",
  };
}

export function zeroIrr(): Money {
  return irrMoney("0");
}

/**
 * Actor paid/share for one posted expense in a date range.
 * Returns zeros when outside range or not posted.
 */
export function actorExpenseSlice(
  expense: Pick<
    ExpenseSummary,
    "status" | "occurredOn" | "paidByUserId" | "total" | "paymentLines" | "splits"
  >,
  actorUserId: string,
  from: string,
  to: string,
): { paidMinor: bigint; shareMinor: bigint; counted: boolean } {
  if (expense.status !== "posted") {
    return { paidMinor: 0n, shareMinor: 0n, counted: false };
  }
  if (expense.occurredOn < from || expense.occurredOn > to) {
    return { paidMinor: 0n, shareMinor: 0n, counted: false };
  }

  const payments = normalizePaymentLines(
    expense.total,
    expense.paidByUserId,
    expense.paymentLines,
  );
  let paidMinor = 0n;
  for (const line of payments) {
    if (line.userId === actorUserId) {
      paidMinor += BigInt(line.amount.amountMinor);
    }
  }

  let shareMinor = 0n;
  for (const line of expense.splits) {
    if (line.userId === actorUserId) {
      shareMinor += BigInt(line.amount.amountMinor);
    }
  }

  return {
    paidMinor,
    shareMinor,
    counted: paidMinor > 0n || shareMinor > 0n,
  };
}

export function sumActorExpensesInRange(
  expenses: readonly Pick<
    ExpenseSummary,
    "status" | "occurredOn" | "paidByUserId" | "total" | "paymentLines" | "splits"
  >[],
  actorUserId: string,
  from: string,
  to: string,
): { paid: Money; share: Money; expenseCount: number } {
  let paid = 0n;
  let share = 0n;
  let expenseCount = 0;
  for (const expense of expenses) {
    const slice = actorExpenseSlice(expense, actorUserId, from, to);
    paid += slice.paidMinor;
    share += slice.shareMinor;
    if (slice.counted) expenseCount += 1;
  }
  return {
    paid: irrMoney(paid),
    share: irrMoney(share),
    expenseCount,
  };
}

export type PersonalMoneyAccountKind = "cash" | "bank" | "card" | "investment" | "other";

export type PersonalMoneyTxnKind =
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "adjustment"
  | "investment"
  | "installment";

export type PersonalMoneyAccountSummary = {
  id: string;
  name: string;
  kind: PersonalMoneyAccountKind;
  currency: "IRR";
  openingBalance: Money;
  /** opening + signed txn deltas. */
  balance: Money;
  archived: boolean;
  createdAt: string;
};

export type PersonalBudgetAlertLevel = "ok" | "warn" | "exceeded";

export type PersonalBudgetSummary = {
  id: string;
  yearMonth: string;
  limit: Money;
  /** Sum of personal expense txns in that calendar month. */
  spent: Money;
  remaining: Money;
  /** 1–100; warn when spent/limit reaches this percent. */
  alertPercent: number;
  alertLevel: PersonalBudgetAlertLevel;
  /** 0–100+ floored percent of limit used. */
  usedPercent: number;
  note?: string;
  createdAt: string;
};

export type PersonalCategorySummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};
export type CreatePersonalCategoryRequest = {
  name: string;
  slug?: string;
  idempotencyKey: string;
};

export type UpdatePersonalCategoryRequest = {
  name?: string;
  slug?: string;
};

export type PersonalFinanceExportKind = "transactions" | "overview";

export type CreatePersonalFinanceExportRequest = {
  from: string;
  to: string;
  kind: PersonalFinanceExportKind;
  idempotencyKey: string;
};

export type PersonalFinanceExportSummary = {
  id: string;
  kind: PersonalFinanceExportKind;
  from: string;
  to: string;
  status: "completed" | "failed";
  rowCount: number;
  createdAt: string;
  completedAt?: string;
  errorDetail?: string;
  hasFile: boolean;
};

export type PersonalResourcesSummary = {
  currency: "IRR";
  totalBalance: Money;
  accountCount: number;
  activeAccountCount: number;
  currentMonthBudget?: PersonalBudgetSummary;
  persistence: "memory" | "postgres";
};

export type CreatePersonalMoneyAccountRequest = {
  name: string;
  kind: PersonalMoneyAccountKind;
  /** Opening balance in IRR minor (may be zero). */
  openingBalance: Money;
  idempotencyKey: string;
};

export type UpdatePersonalMoneyAccountRequest = {
  name?: string;
  archived?: boolean;
};

export type CreatePersonalMoneyTxnRequest = {
  accountId: string;
  kind: "income" | "expense" | "adjustment" | "investment" | "installment";
  amount: Money;
  occurredOn: string;
  note?: string;
  categoryId?: string;
  linkedWorkspaceId?: string;
  linkedExpenseId?: string;
  linkedSettlementId?: string;
  idempotencyKey: string;
};

export type CreatePersonalTransferRequest = {
  fromAccountId: string;
  toAccountId: string;
  amount: Money;
  occurredOn: string;
  note?: string;
  idempotencyKey: string;
};

export type UpsertPersonalBudgetRequest = {
  yearMonth: string;
  limit: Money;
  /** Default 80. Warn when usage reaches this percent. */
  alertPercent?: number;
  note?: string;
  idempotencyKey: string;
};

export type PersonalMoneyTxnSummary = {
  id: string;
  accountId: string;
  kind: PersonalMoneyTxnKind;
  amount: Money;
  occurredOn: string;
  note?: string;
  categoryId?: string;
  categoryName?: string;
  transferGroupId?: string;
  linkedWorkspaceId?: string;
  linkedExpenseId?: string;
  linkedSettlementId?: string;
  createdAt: string;
};

/** Signed delta for an account balance from one txn. */
export function personalTxnSignedDelta(
  kind: PersonalMoneyTxnKind,
  amountMinor: bigint,
): bigint {
  if (amountMinor <= 0n) throw new Error("TXN_AMOUNT");
  switch (kind) {
    case "income":
    case "transfer_in":
      return amountMinor;
    case "expense":
    case "transfer_out":
    case "investment":
    case "installment":
      return -amountMinor;
    case "adjustment":
      return amountMinor;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function computePersonalAccountBalance(
  openingBalanceMinor: bigint,
  txns: readonly { kind: PersonalMoneyTxnKind; amountMinor: bigint }[],
): bigint {
  let balance = openingBalanceMinor;
  for (const txn of txns) {
    balance += personalTxnSignedDelta(txn.kind, txn.amountMinor);
  }
  return balance;
}

export function sumPersonalExpenseInMonth(
  txns: readonly {
    kind: PersonalMoneyTxnKind;
    amountMinor: bigint;
    occurredOn: string;
    /** Precomputed month key (Jalali or Gregorian). Defaults to occurredOn.slice(0, 7). */
    yearMonthKey?: string;
  }[],
  yearMonth: string,
): bigint {
  let spent = 0n;
  for (const txn of txns) {
    if (txn.kind !== "expense") continue;
    const key = txn.yearMonthKey ?? txn.occurredOn.slice(0, 7);
    if (key !== yearMonth) continue;
    spent += txn.amountMinor;
  }
  return spent;
}

export function normalizePersonalBudgetAlertPercent(value?: number): number {
  if (value == null || !Number.isFinite(value)) return 80;
  const n = Math.floor(value);
  if (n < 1 || n > 100) throw new Error("ALERT_PERCENT");
  return n;
}

export function personalBudgetUsedPercent(spentMinor: bigint, limitMinor: bigint): number {
  if (limitMinor <= 0n) return 0;
  const pct = (spentMinor * 100n) / limitMinor;
  return Number(pct > 10_000n ? 10_000n : pct);
}

export function personalBudgetAlertLevel(
  spentMinor: bigint,
  limitMinor: bigint,
  alertPercent = 80,
): PersonalBudgetAlertLevel {
  if (limitMinor <= 0n) return "ok";
  if (spentMinor >= limitMinor) return "exceeded";
  if (spentMinor * 100n >= limitMinor * BigInt(alertPercent)) return "warn";
  return "ok";
}

export function enrichPersonalBudgetSummary(input: {
  id: string;
  yearMonth: string;
  limitMinor: bigint;
  spentMinor: bigint;
  alertPercent: number;
  note?: string;
  createdAt: string;
}): PersonalBudgetSummary {
  const remaining = input.limitMinor - input.spentMinor;
  return {
    id: input.id,
    yearMonth: input.yearMonth,
    limit: irrMoney(input.limitMinor),
    spent: irrMoney(input.spentMinor),
    remaining: irrMoney(remaining),
    alertPercent: input.alertPercent,
    alertLevel: personalBudgetAlertLevel(
      input.spentMinor,
      input.limitMinor,
      input.alertPercent,
    ),
    usedPercent: personalBudgetUsedPercent(input.spentMinor, input.limitMinor),
    note: input.note,
    createdAt: input.createdAt,
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function buildPersonalTransactionsCsv(
  rows: readonly {
    occurredOn: string;
    kind: string;
    accountName: string;
    categoryName?: string;
    amountMinor: string;
    note?: string;
  }[],
): string {
  const header = "date,kind,account,category,amount_toman,note";
  const lines = rows.map((row) => {
    const toman = (Number(row.amountMinor) / 10).toString();
    return [
      row.occurredOn,
      csvEscape(row.kind),
      csvEscape(row.accountName),
      csvEscape(row.categoryName ?? ""),
      toman,
      csvEscape(row.note ?? ""),
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

export function buildPersonalOverviewCsv(
  rows: readonly {
    workspaceName: string;
    spaceKind: string;
    paidMinor: string;
    shareMinor: string;
    netMinor: string;
    expenseCount: number;
  }[],
): string {
  const header = "workspace,space_kind,paid_toman,share_toman,net_toman,expense_count";
  const lines = rows.map((row) =>
    [
      csvEscape(row.workspaceName),
      csvEscape(row.spaceKind),
      (Number(row.paidMinor) / 10).toString(),
      (Number(row.shareMinor) / 10).toString(),
      (Number(row.netMinor) / 10).toString(),
      String(row.expenseCount),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

export function slugifyPersonalCategory(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, "")
    .slice(0, 48);
  return base || `cat-${Date.now().toString(36)}`;
}

export type PersonalFinanceTrendGroupBy = "day" | "week" | "month";

export type PersonalFinanceTrendBucket = {
  key: string;
  label: string;
  /** Actor payment lines on posted group expenses in bucket. */
  paid: Money;
  /** Actor split lines on posted group expenses in bucket. */
  share: Money;
  /** Personal wallet expense txns in bucket. */
  personalExpense: Money;
  expenseCount: number;
};

export type PersonalFinanceTrendsResponse = {
  from: string;
  to: string;
  groupBy: PersonalFinanceTrendGroupBy;
  buckets: PersonalFinanceTrendBucket[];
  totals: {
    paid: Money;
    share: Money;
    personalExpense: Money;
  };
  source: {
    expense: "memory" | "postgres";
    personal: "memory" | "postgres";
  };
};

/** ISO week key YYYY-Www (UTC date). */
export function personalFinanceIsoWeekKey(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function personalFinanceTrendBucketKey(
  isoDate: string,
  groupBy: PersonalFinanceTrendGroupBy,
): string {
  if (groupBy === "month") return isoDate.slice(0, 7);
  if (groupBy === "week") return personalFinanceIsoWeekKey(isoDate);
  return isoDate;
}

export function shouldNotifyPersonalBudgetAlert(
  previous: PersonalBudgetAlertLevel | undefined,
  next: PersonalBudgetAlertLevel,
): boolean {
  if (next !== "warn" && next !== "exceeded") return false;
  return previous !== next;
}

/** Absolute |net| thresholds for workspace balance alerts (IRR minor). */
export type GroupDebtAlertLevel = "ok" | "warn" | "exceeded";

export function groupDebtAlertLevel(netMinor: bigint): GroupDebtAlertLevel {
  const abs = netMinor < 0n ? -netMinor : netMinor;
  if (abs >= 20_000_000n) return "exceeded"; // ≥ ۲ میلیون تومان
  if (abs >= 5_000_000n) return "warn"; // ≥ ۵۰۰ هزار تومان
  return "ok";
}

/**
 * Aggregate actor group paid/share + personal expense txns into time buckets.
 */
export function aggregatePersonalFinanceTrends(input: {
  from: string;
  to: string;
  groupBy: PersonalFinanceTrendGroupBy;
  groupExpenses: readonly Pick<
    ExpenseSummary,
    "status" | "occurredOn" | "paidByUserId" | "total" | "paymentLines" | "splits"
  >[];
  actorUserId: string;
  personalExpenseTxns: readonly {
    kind: PersonalMoneyTxnKind;
    amountMinor: bigint;
    occurredOn: string;
  }[];
}): Omit<PersonalFinanceTrendsResponse, "source"> {
  const buckets = new Map<
    string,
    { label: string; paid: bigint; share: bigint; personalExpense: bigint; expenseCount: number }
  >();

  const touch = (key: string) => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const created = {
      label: key,
      paid: 0n,
      share: 0n,
      personalExpense: 0n,
      expenseCount: 0,
    };
    buckets.set(key, created);
    return created;
  };

  for (const expense of input.groupExpenses) {
    const slice = actorExpenseSlice(
      expense,
      input.actorUserId,
      input.from,
      input.to,
    );
    if (!slice.counted && slice.paidMinor === 0n && slice.shareMinor === 0n) continue;
    if (expense.occurredOn < input.from || expense.occurredOn > input.to) continue;
    if (expense.status !== "posted") continue;
    const key = personalFinanceTrendBucketKey(expense.occurredOn, input.groupBy);
    const bucket = touch(key);
    bucket.paid += slice.paidMinor;
    bucket.share += slice.shareMinor;
    if (slice.counted) bucket.expenseCount += 1;
  }

  for (const txn of input.personalExpenseTxns) {
    if (txn.kind !== "expense") continue;
    if (txn.occurredOn < input.from || txn.occurredOn > input.to) continue;
    const key = personalFinanceTrendBucketKey(txn.occurredOn, input.groupBy);
    const bucket = touch(key);
    bucket.personalExpense += txn.amountMinor;
  }

  let totalPaid = 0n;
  let totalShare = 0n;
  let totalPersonal = 0n;
  const bucketList = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => {
      totalPaid += value.paid;
      totalShare += value.share;
      totalPersonal += value.personalExpense;
      return {
        key,
        label: value.label,
        paid: irrMoney(value.paid),
        share: irrMoney(value.share),
        personalExpense: irrMoney(value.personalExpense),
        expenseCount: value.expenseCount,
      };
    });

  return {
    from: input.from,
    to: input.to,
    groupBy: input.groupBy,
    buckets: bucketList,
    totals: {
      paid: irrMoney(totalPaid),
      share: irrMoney(totalShare),
      personalExpense: irrMoney(totalPersonal),
    },
  };
}

/* —— S11-10 deep personal finance —— */

export type IncomeSourceKind = "salary" | "bonus" | "freelance" | "rent" | "other";
export type IncomeCadence = "monthly" | "weekly" | "yearly" | "irregular";
export type SavingsGoalStatus = "active" | "reached" | "archived";
export type SpendingAlertScope = "total" | "category" | "group" | "workspace";
export type SpendingAlertPeriod = "month" | "week";
export type SpendingAlertChannel = "inapp" | "email";
export type PersonalFinanceOverviewScope = "personal" | "group" | "combined";

export type IncomeSourceSummary = {
  id: string;
  name: string;
  kind: IncomeSourceKind;
  expected?: Money;
  cadence: IncomeCadence;
  currency: "IRR";
  active: boolean;
  createdAt: string;
};

export type CreateIncomeSourceRequest = {
  name: string;
  kind: IncomeSourceKind;
  expected?: Money;
  cadence?: IncomeCadence;
  active?: boolean;
  idempotencyKey: string;
};

export type UpdateIncomeSourceRequest = {
  name?: string;
  kind?: IncomeSourceKind;
  expected?: Money | null;
  cadence?: IncomeCadence;
  active?: boolean;
};

export type SavingsGoalContributionSummary = {
  id: string;
  goalId: string;
  amount: Money;
  occurredAt: string;
  txnId?: string;
  note?: string;
  createdAt: string;
};

export type SavingsGoalSummary = {
  id: string;
  name: string;
  target: Money;
  /** Sum of contributions — never a manually stored progress field. */
  contributed: Money;
  /** 0–100+ floored percent of target. */
  progressPercent: number;
  targetDate?: string;
  accountId?: string;
  status: SavingsGoalStatus;
  createdAt: string;
  reachedAt?: string;
};

export type CreateSavingsGoalRequest = {
  name: string;
  targetMinor: string;
  targetDate?: string;
  accountId?: string;
  idempotencyKey: string;
};

export type UpdateSavingsGoalRequest = {
  name?: string;
  targetMinor?: string;
  targetDate?: string | null;
  accountId?: string | null;
  status?: SavingsGoalStatus;
};

export type CreateSavingsGoalContributionRequest = {
  amountMinor: string;
  occurredAt: string;
  txnId?: string;
  note?: string;
  idempotencyKey: string;
};

/** Aggregated personal savings box — live balance from goal contributions (no fake totals). */
export type PersonalSavingsFundSummary = {
  balanceMinor: string;
  currency: "IRR";
  goalCount: number;
  /** Primary / default box used for monthly deposits. */
  defaultGoal: SavingsGoalSummary | null;
  goals: SavingsGoalSummary[];
};

export type EnsurePersonalSavingsFundRequest = {
  /** Optional custom name; default «صندوق پس‌انداز». */
  name?: string;
  /** Target ceiling for the default box (IRR minor). Default 100_000_000 تومان-scale minor. */
  targetMinor?: string;
  idempotencyKey?: string;
};

export type DepositPersonalSavingsFundRequest = {
  amountMinor: string;
  occurredAt?: string;
  note?: string;
  /** Prefer this goal; otherwise default/active goal. */
  goalId?: string;
  idempotencyKey: string;
};

export type SpendingAlertSummary = {
  id: string;
  scope: SpendingAlertScope;
  refId?: string;
  period: SpendingAlertPeriod;
  limit: Money;
  thresholdPercent: number;
  channel: SpendingAlertChannel;
  active: boolean;
  lastFiredAt?: string;
  createdAt: string;
};

export type PutSpendingAlertsRequest = {
  alerts: Array<{
    id?: string;
    scope: SpendingAlertScope;
    refId?: string | null;
    period?: SpendingAlertPeriod;
    limitMinor: string;
    thresholdPercent?: number;
    channel?: SpendingAlertChannel;
    active?: boolean;
  }>;
};

export type MonthlyCloseSummary = {
  yearMonth: string;
  income: Money;
  expense: Money;
  groupShare: Money;
  personal: Money;
  saved: Money;
  topCategoryId?: string;
  computedAt: string;
  /** True when no income/expense/share data existed for the month. */
  empty: boolean;
  emptyReason?: string;
};

export type RecomputeMonthlyCloseRequest = {
  yearMonth: string;
};

/**
 * Progress from explicit contributions plus optional ledger deposits
 * (income / transfer_in on a linked savings account). Callers should exclude
 * ledger rows already counted via contribution.txnId to avoid double-counting;
 * when that split is unavailable, pass orphan contribution amounts only.
 */
export function computeSavingsGoalProgress(input: {
  targetMinor: bigint;
  contributionAmountMinors: readonly bigint[];
  ledgerDepositMinors?: readonly bigint[];
}): {
  contributedMinor: bigint;
  progressPercent: number;
  reached: boolean;
} {
  let contributed = 0n;
  for (const amount of input.contributionAmountMinors) {
    if (amount > 0n) contributed += amount;
  }
  for (const amount of input.ledgerDepositMinors ?? []) {
    if (amount > 0n) contributed += amount;
  }
  const target = input.targetMinor > 0n ? input.targetMinor : 1n;
  const progressPercent = Number((contributed * 100n) / target);
  return {
    contributedMinor: contributed,
    progressPercent,
    reached: contributed >= input.targetMinor && input.targetMinor > 0n,
  };
}

export function enrichSavingsGoalSummary(input: {
  id: string;
  name: string;
  targetMinor: bigint;
  contributionAmountMinors: readonly bigint[];
  ledgerDepositMinors?: readonly bigint[];
  targetDate?: string | null;
  accountId?: string | null;
  status: SavingsGoalStatus;
  createdAt: string;
  reachedAt?: string | null;
}): SavingsGoalSummary {
  const progress = computeSavingsGoalProgress({
    targetMinor: input.targetMinor,
    contributionAmountMinors: input.contributionAmountMinors,
    ledgerDepositMinors: input.ledgerDepositMinors,
  });
  const status: SavingsGoalStatus =
    input.status === "archived"
      ? "archived"
      : progress.reached
        ? "reached"
        : input.status === "reached"
          ? "reached"
          : "active";
  return {
    id: input.id,
    name: input.name,
    target: irrMoney(input.targetMinor),
    contributed: irrMoney(progress.contributedMinor),
    progressPercent: progress.progressPercent,
    targetDate: input.targetDate ?? undefined,
    accountId: input.accountId ?? undefined,
    status,
    createdAt: input.createdAt,
    reachedAt: input.reachedAt ?? undefined,
  };
}

/**
 * Monthly close rollup from raw personal txns + group share.
 * expense = personal + groupShare; saved = max(0, income − personal − groupShare).
 */
export function computeMonthlyCloseTotals(input: {
  incomeMinor: bigint;
  personalExpenseMinor: bigint;
  groupShareMinor: bigint;
}): {
  incomeMinor: bigint;
  expenseMinor: bigint;
  groupShareMinor: bigint;
  personalMinor: bigint;
  savedMinor: bigint;
  empty: boolean;
} {
  const income = input.incomeMinor < 0n ? 0n : input.incomeMinor;
  const personal = input.personalExpenseMinor < 0n ? 0n : input.personalExpenseMinor;
  const groupShare = input.groupShareMinor < 0n ? 0n : input.groupShareMinor;
  const expense = personal + groupShare;
  const remainder = income - personal - groupShare;
  const saved = remainder > 0n ? remainder : 0n;
  const empty = income === 0n && personal === 0n && groupShare === 0n;
  return {
    incomeMinor: income,
    expenseMinor: expense,
    groupShareMinor: groupShare,
    personalMinor: personal,
    savedMinor: saved,
    empty,
  };
}

export function yearMonthDateBounds(yearMonth: string): { from: string; to: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new Error("YEAR_MONTH");
  }
  const [yRaw, mRaw] = yearMonth.split("-").map(Number);
  const y = yRaw!;
  const m = mRaw!;
  // Jalali months (1300–1699) must use jalaliYearMonthDateBounds — Gregorian Date.UTC is wrong.
  if (y >= 1300 && y <= 1699) {
    throw new Error("YEAR_MONTH_JALALI");
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Gregorian or Jalali year-month → inclusive ISO bounds. */
export function resolveYearMonthDateBounds(
  yearMonth: string,
  jalaliBounds: (ym: string) => { from: string; to: string },
): { from: string; to: string } {
  const y = Number(yearMonth.slice(0, 4));
  if (Number.isFinite(y) && y >= 1300 && y <= 1699) {
    return jalaliBounds(yearMonth);
  }
  return yearMonthDateBounds(yearMonth);
}

/** Threshold amount = floor(limit × thresholdPercent / 100). */
export function spendingAlertThresholdMinor(
  limitMinor: bigint,
  thresholdPercent: number,
): bigint {
  if (limitMinor <= 0n) return 0n;
  const pct = Math.min(100, Math.max(1, Math.floor(thresholdPercent)));
  return (limitMinor * BigInt(pct)) / 100n;
}

/** True only when real spent reaches/exceeds the configured threshold of the limit. */
export function isSpendingAlertBreached(input: {
  spentMinor: bigint;
  limitMinor: bigint;
  thresholdPercent: number;
}): boolean {
  if (input.spentMinor <= 0n || input.limitMinor <= 0n) return false;
  const threshold = spendingAlertThresholdMinor(
    input.limitMinor,
    input.thresholdPercent,
  );
  return input.spentMinor >= threshold;
}

/**
 * Notify at most once per period after a real breach.
 * Does not fire when spent is under threshold.
 */
export function shouldNotifySpendingAlert(input: {
  breached: boolean;
  lastFiredAt?: string | null;
  periodFrom: string;
}): boolean {
  if (!input.breached) return false;
  if (!input.lastFiredAt) return true;
  const firedDay = input.lastFiredAt.slice(0, 10);
  return firedDay < input.periodFrom;
}

/** Calendar week (Mon–Sun UTC) containing isoDate YYYY-MM-DD. */
export function weekDateBounds(isoDate: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error("DATE");
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const to = d.toISOString().slice(0, 10);
  return { from, to };
}

export function spendingAlertPeriodBounds(
  period: SpendingAlertPeriod,
  refIsoDate: string,
): { from: string; to: string } {
  if (period === "week") return weekDateBounds(refIsoDate);
  const yearMonth = refIsoDate.slice(0, 7);
  return yearMonthDateBounds(yearMonth);
}
