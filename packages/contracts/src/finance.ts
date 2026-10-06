import type { Money } from "./money.js";
import type { ApprovalTier } from "./maker-checker.js";
import type { PostingHoldReason } from "./expense-posting.js";

export type SplitMethod =
  | "equal"
  | "amount"
  | "percent"
  | "shares"
  | "itemized"
  | "formula";

export type FormulaBasis = "area" | "occupancy";

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
  /** Category ids that always require a receipt (additive to amount threshold). */
  requireReceiptCategoryIds?: string[];
  /** When true, org expenses must carry costCenterId (G09 #32). */
  requireCostCenter?: boolean;
  /**
   * Custom maker-checker tiers; null/omitted in storage = use DEFAULT_APPROVAL_TIERS (G09 #31).
   */
  approvalTiers?: ApprovalTier[] | null;
  /** Daily per-diem cap in IRR minor for actor on occurredOn day (G09 #14). */
  perDiemDailyMinor?: string | null;
  updatedAt?: string;
  updatedByUserId?: string;
};

export type UpdateWorkspaceExpensePolicyRequest = {
  approvalThresholdMinor: string | null;
  requireReceiptAboveMinor: string | null;
  /** Replace category receipt list; omit to leave unchanged on partial clients — prefer always send. */
  requireReceiptCategoryIds?: string[];
  requireCostCenter?: boolean;
  approvalTiers?: ApprovalTier[] | null;
  perDiemDailyMinor?: string | null;
};

export type ApprovalQueueItem = {
  kind: "addon_charge" | "member_invoice" | "expense" | "settlement";
  id: string;
  title: string;
  amount?: Money;
  status: string;
  hrefHint: string;
  createdAt: string;
  /** Distinct approved decisions so far (Phase 2.3 tiers). */
  approvalsHave?: number;
  /** Required distinct approvers for the amount band. */
  approvalsNeeded?: number;
  /** ISO due time when MAKER_CHECKER_SLA_HOURS is set. */
  slaDueAt?: string;
  /** True when now is past slaDueAt (API-computed; not a fake badge). */
  slaBreached?: boolean;
};

/** Hours from `MAKER_CHECKER_SLA_HOURS`, or null when unset/invalid. */
export function approvalQueueSlaHours(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): number | null {
  const raw = env.MAKER_CHECKER_SLA_HOURS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Additive SLA fields from createdAt + hours threshold. */
export function withApprovalQueueSla(
  createdAt: string,
  hours: number | null,
  nowMs: number = Date.now(),
): Pick<ApprovalQueueItem, "slaDueAt" | "slaBreached"> {
  if (hours == null) return {};
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return {};
  const dueMs = createdMs + hours * 3_600_000;
  return {
    slaDueAt: new Date(dueMs).toISOString(),
    slaBreached: nowMs > dueMs,
  };
}

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

/**
 * When both quantity and unitPriceMinor are set, amountMinor must equal
 * round(quantity × unitPriceMinor); otherwise AMOUNT_MISMATCH (S11-07).
 */
export function assertAmountMatchesQuantity(input: {
  amountMinor: string;
  quantity?: number;
  unitPriceMinor?: string;
}): void {
  if (input.quantity === undefined || input.unitPriceMinor === undefined) return;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("AMOUNT_MISMATCH");
  }
  if (!/^\d+$/.test(input.unitPriceMinor)) {
    throw new Error("AMOUNT_MISMATCH");
  }
  const expected = BigInt(Math.round(input.quantity * Number(input.unitPriceMinor)));
  let actual: bigint;
  try {
    actual = BigInt(input.amountMinor);
  } catch {
    throw new Error("AMOUNT_MISMATCH");
  }
  if (actual !== expected) {
    throw new Error("AMOUNT_MISMATCH");
  }
}

/** Optional catalog snapshot fields on a consumption / expense line (S11-07). */
export type CatalogLineFields = {
  /** Real catalog item id when picked from catalog; omit for free-text. */
  catalogItemId?: string;
  unitCode?: string;
  /** Positive quantity; up to 3 decimal places in practice. */
  quantity?: number;
  /** Snapshot unit price in IRR minor at registration time. */
  unitPriceMinor?: string;
};

/** Line on an itemized bill (lunch receipt). */
export type ExpenseItemInput = CatalogLineFields & {
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
  /** Catalog snapshot for non-itemized daily-ledger lines (S11-07). */
  catalogItemId?: string;
  unitCode?: string;
  quantity?: number;
  unitPriceMinor?: string;
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
   * `auto` lets the server decide, in one request, whether the expense can be
   * posted immediately or must wait for approval. Omitted = keep as draft.
   */
  commit?: "draft" | "auto";
  /**
   * System provenance — set by daily ledger (and similar) creators.
   * Omitted/null = classic expense UI.
   */
  source?: "daily_ledger" | null;
  /** Preserved source money only; reporting/ledger total remains IRR. */
  originalCurrency?: string;
  originalAmountMinor?: string;
  /** Set by API when conversionLive binds original → IRR via rate table. */
  fxRateId?: string;
  /**
   * How the purchase was funded (S11-09).
   * `petty_cash` + `fundingRefId` (fund id) posts a linked spend on the fund when the expense posts.
   */
  fundingSourceKind?: "petty_cash" | "personal" | "member" | "credit";
  fundingRefId?: string;
  /** Optional workspace tag ids (G03 #18). */
  tagIds?: string[];
  /** Required when splitMethod is formula (G08 #29). */
  formulaBasis?: FormulaBasis;
  /** Populated by API when resolving formula splits from subunits. */
  formulaWeights?: readonly { userId: string; weight: number }[];
  /** Travel advance/settlement light tag (G09 #35) — forces company visibility when set. */
  missionKind?: "advance" | "settlement";
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

/** Positive numeric weights — same remainder rules as shares. */
export function allocateFormulaSplit(
  total: Money,
  weights: readonly { userId: string; weight: number }[],
): ExpenseSplitLine[] {
  if (!weights.length) {
    throw new Error("SPLIT_FORMULA");
  }
  const scaled = weights.map((line) => {
    const userId = line.userId.trim();
    if (!userId || !Number.isFinite(line.weight) || line.weight <= 0) {
      throw new Error("SPLIT_FORMULA");
    }
    const weight = BigInt(Math.round(line.weight * 10_000));
    if (weight <= 0n) throw new Error("SPLIT_FORMULA");
    return { userId, weight, weightNum: line.weight };
  });
  const allocated = distributeRemainder(
    total,
    scaled.map((line) => ({ userId: line.userId, weight: line.weight })),
  );
  return allocated;
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
  formulaWeights?: readonly { userId: string; weight: number }[];
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
    case "formula": {
      if (!input.formulaWeights?.length) throw new Error("SPLIT_FORMULA");
      return allocateFormulaSplit(input.total, input.formulaWeights);
    }
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
  /** Creator — used for four-eyes / maker-checker. */
  createdByUserId?: string;
  /**
   * When `commit:auto` stops at submitted: server-side hold reasons
   * (receipt / four-eyes / approval threshold / company role).
   */
  postingHoldReasons?: PostingHoldReason[];
  /** Persian one-liner for {@link postingHoldReasons}; omit when posted. */
  postingHoldMessageFa?: string;
  /** Multi-level tier progress (Phase 2.3); present when approve is still pending. */
  approvalsHave?: number;
  approvalsNeeded?: number;
  tierApprovalStatus?: "pending" | "complete" | "rejected";
  /** Present when created via daily ledger (or similar). */
  source?: "daily_ledger";
  /** Catalog snapshot when a daily-ledger / single-line expense picked from catalog (S11-07). */
  catalogItemId?: string;
  unitCode?: string;
  quantity?: number;
  unitPriceMinor?: string;
  originalCurrency?: string;
  originalAmountMinor?: string;
  fxRateId?: string;
  fundingSourceKind?: "petty_cash" | "personal" | "member" | "credit";
  fundingRefId?: string;
  /** Linked workspace tag ids when present. */
  tagIds?: string[];
  /** Travel advance/settlement when recorded (G09 #35). */
  missionKind?: "advance" | "settlement";
  note?: string;
  /** Soft-void provenance when status is reversed (additive). */
  reverseReason?: string;
  reversedAt?: string;
  reversedByUserId?: string;
};

export type CreateOutingRequest = {
  title: string;
  occurredOn: string;
  note?: string;
  idempotencyKey: string;
  /** Optional IRR minor budget ceiling for the event (G04 #3). */
  budgetCapMinor?: string;
  startsOn?: string;
  endsOn?: string;
};

export type OutingSummary = {
  id: string;
  workspaceId: string;
  title: string;
  note?: string;
  occurredOn: string;
  budgetCapMinor?: string;
  startsOn?: string;
  endsOn?: string;
  createdByUserId: string;
  createdAt: string;
  expenseIds: string[];
  total: Money;
};

/** Workspace guest without an account yet (G04 #1). */
export type GuestPlaceholderSummary = {
  id: string;
  workspaceId: string;
  displayName: string;
  phoneE164?: string;
  claimedUserId?: string;
  claimedAt?: string;
  createdByUserId: string;
  createdAt: string;
  /** Plain claim token — only returned at create time. */
  claimToken?: string;
  claimPath?: string;
};

export type CreateGuestPlaceholderRequest = {
  displayName: string;
  phoneE164?: string;
  idempotencyKey: string;
};

export type ClaimGuestPlaceholderRequest = {
  /** Token from create response / claim link. */
  claimToken: string;
  idempotencyKey: string;
};

export type ClaimGuestPlaceholderResponse = {
  placeholder: GuestPlaceholderSummary;
  remappedExpenseCount: number;
  remappedLedgerLineCount: number;
};

/** Named split template (G04 #7). */
export type SplitPresetLine = {
  userId: string;
  shares?: number;
  /** Basis points when percent method (10000 = 100%). */
  percentBp?: number;
  amountMinor?: string;
};

export type SplitPresetSummary = {
  id: string;
  workspaceId: string;
  name: string;
  splitMethod: "equal" | "amount" | "percent" | "shares";
  lines: SplitPresetLine[];
  createdByUserId: string;
  createdAt: string;
};

export type CreateSplitPresetRequest = {
  name: string;
  splitMethod: "equal" | "amount" | "percent" | "shares";
  lines: SplitPresetLine[];
  idempotencyKey: string;
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
  /** Maker for four-eyes (R10-25); who created the claim. */
  createdByUserId?: string;
  /** Multi-level tier progress (Phase 2.3); present when confirm is still pending. */
  approvalsHave?: number;
  approvalsNeeded?: number;
  tierApprovalStatus?: "pending" | "complete" | "rejected";
  /** Optional claim note (e.g. debt-simplify marker). */
  note?: string;
};

/** Canonical note written when materializing greedy debt-simplify suggestions. */
export const DEBT_SIMPLIFY_CLAIM_NOTE = "پیشنهاد ساده‌سازی بدهی (greedy)";

export function isDebtSimplifyClaimNote(note: string | undefined | null): boolean {
  return (note?.trim() ?? "") === DEBT_SIMPLIFY_CLAIM_NOTE;
}

/** Net balance line. Positive amountMinor => others (or fund) owe this party. */
export type BalanceLine = {
  /** Member user id, or fund party id `fund:{fundId}`. */
  userId: string;
  net: Money;
  /** When omitted, inferred from userId prefix. */
  partyKind?: "member" | "fund";
};

export type JournalLineSide = "debit" | "credit";

export type JournalLine = {
  /** Soft account key, e.g. `member:{userId}` or `fund:{fundId}`. */
  accountCode: string;
  /** Member user id or fund party id `fund:{fundId}`. */
  userId: string;
  side: JournalLineSide;
  amount: Money;
};

export type JournalSourceType =
  | "expense"
  | "settlement"
  | "payment_receipt"
  | "payment_on_behalf";

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
  /**
   * Business date (YYYY-MM-DD) used for asOf balance cuts.
   * Falls back to createdAt day when omitted (legacy rows).
   */
  occurredOn?: string;
  createdAt: string;
};

/** Day used for asOf filtering — prefer business date over wall-clock. */
export function journalAsOfDay(
  entry: Pick<JournalEntrySummary, "createdAt" | "occurredOn">,
): string {
  const business = entry.occurredOn?.trim();
  if (business && /^\d{4}-\d{2}-\d{2}/.test(business)) {
    return business.slice(0, 10);
  }
  return entry.createdAt.slice(0, 10);
}

export type WorkspaceBalancesResponse = {
  workspaceId: string;
  /** False when journal is persisted in Postgres with RLS. */
  provisional: boolean;
  source: "memory_journal" | "postgres_journal";
  currency: "IRR";
  lines: BalanceLine[];
  /** Sum of all nets must be zero for a consistent slice. */
  zeroSum: boolean;
  /**
   * When set, lines are projected only from journal activity on/before this
   * ISO date (YYYY-MM-DD). Live balances omit this field.
   */
  asOf?: string;
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

/**
 * Confirm open debt-simplify claims the actor is allowed to confirm
 * (creditor party, or finance override with existing MFA/four-eyes gates).
 */
export type ConfirmSimplifySettlementClaimsRequest = {
  idempotencyKey: string;
  /** When set, only these claimed simplify settlements are attempted. */
  settlementIds?: string[];
};

export type ConfirmSimplifySettlementClaimsResponse = {
  workspaceId: string;
  confirmed: SettlementSummary[];
  failed: Array<{ settlementId: string; detail: string }>;
  skipped: number;
};

/** Optional body for settlement confirm — required when settlementEvidence flag is on. */
export type ConfirmSettlementRequest = {
  evidenceKind?: "receipt" | "cash_ack" | "gateway";
  receiptId?: string;
  cashAckNote?: string;
};

/** Preview balance nets before/after hypothetical transfers (Wave 4 #17). */
export type PreviewSettlementEffectRequest = {
  transfers: Array<{
    fromUserId: string;
    toUserId: string;
    amount: Money;
  }>;
};

export type PreviewSettlementEffectResponse = {
  workspaceId: string;
  before: BalanceLine[];
  after: BalanceLine[];
  zeroSumBefore: boolean;
  zeroSumAfter: boolean;
};

/**
 * Project net balances after applying transfers as if already confirmed.
 * Does not mutate ledger — preview only (Wave 4 #17).
 */
export function previewBalancesAfterTransfers(
  lines: readonly BalanceLine[],
  transfers: readonly Pick<
    SettlementSuggestion,
    "fromUserId" | "toUserId" | "amount"
  >[],
): BalanceLine[] {
  const nets = new Map<string, bigint>();
  for (const line of lines) {
    nets.set(line.userId, BigInt(line.net.amountMinor));
  }
  for (const t of transfers) {
    const pay = BigInt(t.amount.amountMinor);
    if (pay <= 0n) continue;
    nets.set(t.fromUserId, (nets.get(t.fromUserId) ?? 0n) + pay);
    nets.set(t.toUserId, (nets.get(t.toUserId) ?? 0n) - pay);
  }
  return [...nets.entries()]
    .filter(([, net]) => net !== 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, net]) => ({
      userId,
      net: { amountMinor: net.toString(), currency: "IRR" as const },
    }));
}

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

/** Journal / balance party id for a petty-cash fund. */
export function fundPartyId(fundId: string): string {
  const id = fundId.trim();
  if (!id) throw new Error("FUND_ID");
  return id.startsWith("fund:") ? id : `fund:${id}`;
}

export type FundingSourceKind = NonNullable<ExpenseSummary["fundingSourceKind"]>;

/** Short Persian label for funding source (statements, invoices, Excel). */
export function fundingSourceKindLabelFa(
  kind?: FundingSourceKind | null,
): string {
  switch (kind) {
    case "petty_cash":
      return "صندوق تنخواه";
    case "personal":
      return "حساب شخصی";
    case "member":
      return "حساب عضو";
    case "credit":
      return "خرید اعتباری";
    default:
      return "—";
  }
}

/**
 * Per-member settlement note for statement lines (printable / UI).
 * Explains who is owed relative to funding source — independent of journal mode.
 */
export function statementFundingNoteFa(
  expense: Pick<ExpenseSummary, "fundingSourceKind" | "paidByUserId">,
  userId: string,
): string | undefined {
  const kind = expense.fundingSourceKind ?? "personal";
  const source = fundingSourceKindLabelFa(kind);
  if (kind === "petty_cash") {
    return `${source}: سهم شما بدهی به صندوق است؛ با شارژ تنخواه تسویه می‌شود.`;
  }
  if (kind === "credit") {
    return `${source}: طبق سیاست فضای کاری تسویه می‌شود.`;
  }
  if (kind === "member") {
    return userId === expense.paidByUserId
      ? `${source} تأمین‌کننده: سهم خودتان از جبران کم می‌شود.`
      : `${source}: سهم شما بدهی به صندوق/گروه است.`;
  }
  return userId === expense.paidByUserId
    ? `${source} شما: سهم خود از جبران کم می‌شود؛ مانده بستانکاری از صندوق است.`
    : `${source} پرداخت‌کننده: سهم شما بدهی به صندوق/گروه است (نه لزوماً پرداخت مستقیم به او).`;
}

/** Result of POST …/expenses/rebuild-fund-party-journals */
export type RebuildFundPartyJournalsResult = {
  rebuilt: number;
  created: number;
  skipped: number;
  totalPosted: number;
  /** Already had fund:* journal lines (idempotent skip). */
  skippedAlreadyFund: number;
  /** No fund id available — classic journal kept. */
  skippedNoFund: number;
  /** Whether force=true was requested. */
  forced: boolean;
};

export function formatFundPartyRebuildSummaryFa(
  result: RebuildFundPartyJournalsResult,
): string {
  const parts = [
    `${result.rebuilt} بازسازی`,
    `${result.created} ایجاد`,
    `${result.skipped} ردشده`,
  ];
  if (result.skippedAlreadyFund > 0) {
    parts.push(`${result.skippedAlreadyFund} از قبل مدل صندوق`);
  }
  if (result.skippedNoFund > 0) {
    parts.push(`${result.skippedNoFund} بدون صندوق`);
  }
  const forceNote = result.forced ? " (اجباری)" : "";
  return `از ${result.totalPosted} خرج ثبت‌شده${forceNote}: ${parts.join(" · ")}`;
}

export function fundAccountCode(fundId: string): string {
  return fundPartyId(fundId);
}

export function isFundPartyId(partyId: string | null | undefined): boolean {
  return Boolean(partyId?.startsWith("fund:"));
}

export function parseFundIdFromParty(partyId: string): string | null {
  if (!isFundPartyId(partyId)) return null;
  const id = partyId.slice("fund:".length).trim();
  return id || null;
}

export function balancePartyKind(
  partyId: string,
): NonNullable<BalanceLine["partyKind"]> {
  return isFundPartyId(partyId) ? "fund" : "member";
}

export type BuildExpenseJournalOptions = {
  /**
   * When true and a fund id is available, post member↔fund lines instead of
   * classic payer-credit Splitwise lines.
   */
  fundAsSettlementParty?: boolean;
  /** Fallback fund when expense has no fundingRefId (personal advance clearing). */
  defaultFundId?: string;
};

function resolveExpenseFundId(
  expense: Pick<ExpenseSummary, "fundingSourceKind" | "fundingRefId">,
  options?: BuildExpenseJournalOptions,
): string | null {
  const fromExpense = expense.fundingRefId?.trim();
  if (fromExpense) return fromExpense;
  const fallback = options?.defaultFundId?.trim();
  return fallback || null;
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

/**
 * Payer(s) credited; each participant debited for their share.
 *
 * With `fundAsSettlementParty` + fund id:
 * - `petty_cash`: members debit (owe fund), fund credits (receivable).
 * - `personal` / unset / `member`: members debit to fund, then fund debits and
 *   payer credits for the cash advanced (fund nets ~0; payer reimbursable =
 *   paid − own share; prior debt nets on balances).
 * - `credit`: classic member lines (unchanged).
 */
export function buildExpenseJournalLines(
  expense: Pick<
    ExpenseSummary,
    | "paidByUserId"
    | "total"
    | "splits"
    | "paymentLines"
    | "fundingSourceKind"
    | "fundingRefId"
  >,
  options?: BuildExpenseJournalOptions,
): JournalLine[] {
  const fundMode = Boolean(options?.fundAsSettlementParty);
  const fundId = resolveExpenseFundId(expense, options);
  const kind = expense.fundingSourceKind ?? "personal";

  if (fundMode && fundId && kind !== "credit") {
    const fundParty = fundPartyId(fundId);
    const lines: JournalLine[] = [];

    for (const split of expense.splits) {
      const amt = BigInt(split.amount.amountMinor);
      if (amt <= 0n) continue;
      lines.push({
        accountCode: memberAccountCode(split.userId),
        userId: split.userId,
        side: "debit",
        amount: split.amount,
      });
      lines.push({
        accountCode: fundAccountCode(fundId),
        userId: fundParty,
        side: "credit",
        amount: split.amount,
      });
    }

    if (kind !== "petty_cash") {
      const payers =
        expense.paymentLines?.length > 0
          ? expense.paymentLines
          : [{ userId: expense.paidByUserId, amount: expense.total }];
      for (const payer of payers) {
        lines.push({
          accountCode: fundAccountCode(fundId),
          userId: fundParty,
          side: "debit",
          amount: payer.amount,
        });
        lines.push({
          accountCode: memberAccountCode(payer.userId),
          userId: payer.userId,
          side: "credit",
          amount: payer.amount,
        });
      }
    }

    assertBalancedJournalLines(lines);
    return lines;
  }

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

/** Confirmed settlement: debtor credited, creditor debited (member or fund party). */
export function buildSettlementJournalLines(
  settlement: Pick<SettlementSummary, "fromUserId" | "toUserId" | "amount">,
): JournalLine[] {
  const partyAccount = (partyId: string) => {
    if (isFundPartyId(partyId)) {
      const fid = parseFundIdFromParty(partyId)!;
      return { accountCode: fundAccountCode(fid), userId: fundPartyId(fid) };
    }
    return { accountCode: memberAccountCode(partyId), userId: partyId };
  };
  const to = partyAccount(settlement.toUserId);
  const from = partyAccount(settlement.fromUserId);
  const lines: JournalLine[] = [
    {
      accountCode: to.accountCode,
      userId: to.userId,
      side: "debit",
      amount: settlement.amount,
    },
    {
      accountCode: from.accountCode,
      userId: from.userId,
      side: "credit",
      amount: settlement.amount,
    },
  ];
  assertBalancedJournalLines(lines);
  return lines;
}

/** Approved payment receipt without settlement confirm: credit payer, debit counterparty. */
export function buildPaymentReceiptJournalLines(input: {
  payerUserId: string;
  counterpartyUserId: string;
  amount: Money;
}): JournalLine[] {
  const lines: JournalLine[] = [
    {
      accountCode: memberAccountCode(input.counterpartyUserId),
      userId: input.counterpartyUserId,
      side: "debit",
      amount: input.amount,
    },
    {
      accountCode: memberAccountCode(input.payerUserId),
      userId: input.payerUserId,
      side: "credit",
      amount: input.amount,
    },
  ];
  assertBalancedJournalLines(lines);
  return lines;
}

/**
 * On-behalf payment (standalone): debtor debt decreases (credit),
 * funded from payer's account (debit payer).
 */
export function buildOnBehalfJournalLines(input: {
  debtorUserId: string;
  payerUserId: string;
  amount: Money;
}): JournalLine[] {
  const lines: JournalLine[] = [
    {
      accountCode: memberAccountCode(input.debtorUserId),
      userId: input.debtorUserId,
      side: "credit",
      amount: input.amount,
    },
    {
      accountCode: memberAccountCode(input.payerUserId),
      userId: input.payerUserId,
      side: "debit",
      amount: input.amount,
    },
  ];
  assertBalancedJournalLines(lines);
  return lines;
}

/**
 * After settlement confirm: move settlement credit from debtor to funding payer
 * so payer's credit is tracked honestly (debtor now owes payer).
 */
export function buildOnBehalfFundingTransferLines(input: {
  debtorUserId: string;
  payerUserId: string;
  amount: Money;
}): JournalLine[] {
  const lines: JournalLine[] = [
    {
      accountCode: memberAccountCode(input.debtorUserId),
      userId: input.debtorUserId,
      side: "debit",
      amount: input.amount,
    },
    {
      accountCode: memberAccountCode(input.payerUserId),
      userId: input.payerUserId,
      side: "credit",
      amount: input.amount,
    },
  ];
  assertBalancedJournalLines(lines);
  return lines;
}

/**
 * Member net = credits − debits on party accounts (`member:*` or `fund:*`).
 * Positive => others (or counterparties) owe this party.
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
      partyKind: balancePartyKind(userId),
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
      partyKind: balancePartyKind(userId),
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

/** Largest simplified edge that touches this user. Personal spaces have no counterparty. */
export function primaryCounterpartyEdge(
  lines: readonly BalanceLine[],
  userId: string,
): {
  direction: "debt" | "credit";
  counterpartyId: string;
  amountMinor: string;
} | null {
  const mine = suggestMinimalSettlements(lines).filter(
    (edge) => edge.fromUserId === userId || edge.toUserId === userId,
  );
  if (mine.length === 0 || !userId) return null;
  const top = mine.reduce((best, edge) =>
    BigInt(edge.amount.amountMinor) > BigInt(best.amount.amountMinor) ? edge : best,
  );
  if (top.fromUserId === userId) {
    return {
      direction: "debt",
      counterpartyId: top.toUserId,
      amountMinor: top.amount.amountMinor,
    };
  }
  return {
    direction: "credit",
    counterpartyId: top.fromUserId,
    amountMinor: top.amount.amountMinor,
  };
}

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

/** Human-readable settlement edge for UI (member or fund). */
export function settlementEdgeLabelFa(input: {
  fromPartyId: string;
  toPartyId: string;
  memberLabel: (userId: string) => string;
  fundLabel?: string;
}): string {
  const fund = input.fundLabel?.trim() || "صندوق تنخواه";
  const from = isFundPartyId(input.fromPartyId)
    ? fund
    : input.memberLabel(input.fromPartyId);
  const to = isFundPartyId(input.toPartyId)
    ? fund
    : input.memberLabel(input.toPartyId);
  if (isFundPartyId(input.toPartyId) && !isFundPartyId(input.fromPartyId)) {
    return `${from} واریز به ${to}`;
  }
  if (isFundPartyId(input.fromPartyId) && !isFundPartyId(input.toPartyId)) {
    return `${fund} جبران به ${to}`;
  }
  return `${from} می‌دهد به ${to}`;
}

export type ExpenseFundingExplain = {
  mode: "classic" | "fund_spend" | "personal_advance";
  fundId?: string;
  payerUserId: string;
  totalMinor: string;
  payerOwnShareMinor: string;
  /** Paid − own share (before prior-debt netting on balances). */
  payerGrossReimbursableMinor: string;
  notesFa: string[];
  lines: Array<{
    userId: string;
    amountMinor: string;
    roleFa: string;
  }>;
};

/** Transparent explanation for statements / expense detail when fund party is on. */
export function explainExpenseFundingSettlement(
  expense: Pick<
    ExpenseSummary,
    | "paidByUserId"
    | "total"
    | "splits"
    | "fundingSourceKind"
    | "fundingRefId"
  >,
  options?: BuildExpenseJournalOptions,
): ExpenseFundingExplain {
  const fundMode = Boolean(options?.fundAsSettlementParty);
  const fundId = resolveExpenseFundId(expense, options) ?? undefined;
  const kind = expense.fundingSourceKind ?? "personal";
  const totalMinor = expense.total.amountMinor;
  const payerOwn =
    expense.splits.find((s) => s.userId === expense.paidByUserId)?.amount
      .amountMinor ?? "0";
  const grossReimb = (
    BigInt(totalMinor) - BigInt(payerOwn)
  ).toString();

  if (!fundMode || !fundId || kind === "credit") {
    return {
      mode: "classic",
      payerUserId: expense.paidByUserId,
      totalMinor,
      payerOwnShareMinor: payerOwn,
      payerGrossReimbursableMinor: grossReimb,
      notesFa: [
        "مدل کلاسیک: طلبکار همان پرداخت‌کننده است؛ بدهکاران سهم مصرف را به او می‌پردازند.",
      ],
      lines: expense.splits.map((s) => ({
        userId: s.userId,
        amountMinor: s.amount.amountMinor,
        roleFa:
          s.userId === expense.paidByUserId
            ? "سهم مصرف پرداخت‌کننده"
            : "بدهی به پرداخت‌کننده",
      })),
    };
  }

  if (kind === "petty_cash") {
    return {
      mode: "fund_spend",
      fundId,
      payerUserId: expense.paidByUserId,
      totalMinor,
      payerOwnShareMinor: payerOwn,
      payerGrossReimbursableMinor: "0",
      notesFa: [
        "منبع پرداخت: صندوق تنخواه گروه.",
        "هر عضو به‌اندازهٔ سهم مصرف به صندوق بدهکار است و باید تنخواه را شارژ کند.",
        "پرداخت‌کنندهٔ شخصی برای این خرج طلبکار نمی‌شود.",
      ],
      lines: expense.splits.map((s) => ({
        userId: s.userId,
        amountMinor: s.amount.amountMinor,
        roleFa: "بدهی به صندوق تنخواه",
      })),
    };
  }

  return {
    mode: "personal_advance",
    fundId,
    payerUserId: expense.paidByUserId,
    totalMinor,
    payerOwnShareMinor: payerOwn,
    payerGrossReimbursableMinor: grossReimb.startsWith("-") ? "0" : grossReimb,
    notesFa: [
      "منبع پرداخت: حساب شخصی پرداخت‌کننده.",
      "سهم مصرف بقیه به‌عنوان بدهی به صندوق ثبت می‌شود.",
      "سهم خود پرداخت‌کننده از جبران کم می‌شود؛ بدهی قبلی او به صندوق در مانده‌ها تهاتر می‌شود.",
      "اگر بعد از سهم خود و بدهی قبلی چیزی بماند، بستانکاری او از صندوق است (جبران از تنخواه).",
    ],
    lines: expense.splits.map((s) => ({
      userId: s.userId,
      amountMinor: s.amount.amountMinor,
      roleFa:
        s.userId === expense.paidByUserId
          ? "سهم مصرف خود (از جبران کم می‌شود)"
          : "بدهی به صندوق تنخواه",
    })),
  };
}


/** Workspace expense tag (G03 #18). */
export type ExpenseTagSummary = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  color?: string;
  createdAt: string;
  createdByUserId: string;
};

export type CreateExpenseTagRequest = {
  name: string;
  /** Optional; derived from name when omitted. */
  slug?: string;
  color?: string;
  idempotencyKey: string;
};

export type SetExpenseTagsRequest = {
  tagIds: string[];
};

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
