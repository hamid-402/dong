import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, yearMonthSchema } from "./schemas/money.js";
import type { Money } from "./money.js";

export type ReimbursementStatus =
  | "draft" | "submitted" | "approved" | "rejected" | "paid" | "cancelled";
export type ReimbursementSummary = {
  id: string; workspaceId: string; expenseId?: string; claimantUserId: string;
  amount: Money; title: string; status: ReimbursementStatus; note?: string;
  decidedBy?: string; decidedAt?: string; paidAt?: string; createdAt: string; updatedAt: string;
};
export const createReimbursementSchema = z.object({
  expenseId: entityIdSchema.optional(),
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  title: z.string().trim().min(1).max(160),
  note: z.string().max(4000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();
export type CreateReimbursementRequest = z.infer<typeof createReimbursementSchema>;
export const reimbursementDecisionSchema = z.object({ note: z.string().max(4000).optional() }).strict();

export type CategoryBudgetSummary = {
  id: string; workspaceId: string; categoryId: string; yearMonth: string;
  limit: Money; alertPct: number; active: boolean; createdByUserId: string; createdAt: string;
};
export type CategoryBudgetUsage = CategoryBudgetSummary & {
  spent: Money; remaining: Money; alertReached: boolean;
};
export const createCategoryBudgetSchema = z.object({
  categoryId: entityIdSchema,
  yearMonth: yearMonthSchema,
  limitMinor: z.string().regex(/^[1-9]\d*$/),
  alertPct: z.number().int().min(1).max(100).default(80),
  idempotencyKey: idempotencyKeySchema,
}).strict();
export type CreateCategoryBudgetRequest = z.infer<typeof createCategoryBudgetSchema>;

export const reviseRecurringRuleSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  amountMinor: z.string().regex(/^[1-9]\d*$/).optional(),
  cadence: z.enum(["weekly", "monthly", "yearly"]).optional(),
  nextRunOn: isoDateSchema.optional(),
  effectiveFrom: isoDateSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict();
export type ReviseRecurringRuleRequest = z.infer<typeof reviseRecurringRuleSchema>;

export type FxRateSummary = {
  id: string; baseCurrency: string; quoteCurrency: string; rate: string;
  asOf: string; source: string; createdAt: string;
};
export const isoCurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export const createFxRateSchema = z.object({
  baseCurrency: isoCurrencySchema,
  quoteCurrency: isoCurrencySchema,
  rate: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine((v) => Number(v) > 0),
  asOf: isoDateSchema,
  source: z.string().trim().min(1).max(120),
}).strict();
export type CreateFxRateRequest = z.infer<typeof createFxRateSchema>;

/** Read-only FX math preview (G13). When conversionLive, same math binds expense IRR totals. */
export const fxConvertPreviewSchema = z
  .object({
    fromCurrency: isoCurrencySchema,
    toCurrency: isoCurrencySchema,
    amount: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
      .refine((v) => Number(v) > 0),
    asOf: isoDateSchema.optional(),
  })
  .strict();
export type FxConvertPreviewRequest = z.infer<typeof fxConvertPreviewSchema>;

export type FxConvertPreviewResponse = {
  fromCurrency: string;
  toCurrency: string;
  amount: string;
  convertedAmount: string;
  rate: string;
  rateAsOf: string;
  source: string;
  inverted: boolean;
  /**
   * true when capabilities.conversionLive — preview math matches the
   * same path used to bind originalCurrency → IRR total on expense draft.
   */
  live: boolean;
};

/**
 * Multiply two positive decimal strings without claiming full Decimal128 precision.
 * Used only for read-only preview; not for ledger posting.
 */
export function multiplyDecimalStrings(amount: string, rate: string): string {
  const a = Number(amount);
  const r = Number(rate);
  if (!Number.isFinite(a) || !Number.isFinite(r) || a <= 0 || r <= 0) {
    throw new Error("FX_PREVIEW_INVALID_NUMBER");
  }
  const raw = a * r;
  if (!Number.isFinite(raw)) throw new Error("FX_PREVIEW_OVERFLOW");
  const fixed = raw.toFixed(8).replace(/\.?0+$/, "");
  return fixed === "" ? "0" : fixed;
}

export type ExpenseCsvRow = {
  title: string; amountToman: string; occurredOn: string;
  visibility: "shared" | "private" | "company";
};
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { out.push(value.trim()); value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  out.push(value.trim());
  return out;
}
export function parseExpenseCsv(csvText: string): ExpenseCsvRow[] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV_EMPTY");
  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const expected = ["title", "amount_toman", "occurred_on", "visibility"];
  if (expected.some((name, index) => header[index] !== name)) throw new Error("CSV_HEADER");
  return lines.slice(1).map((line) => {
    const [title, amountToman, occurredOn, visibility] = parseCsvLine(line);
    if (!title || !/^[1-9]\d*$/.test(amountToman ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn ?? "")) {
      throw new Error("CSV_ROW");
    }
    if (visibility !== "shared" && visibility !== "private" && visibility !== "company") throw new Error("CSV_VISIBILITY");
    return { title, amountToman: amountToman!, occurredOn: occurredOn!, visibility };
  });
}
export const expenseCsvImportSchema = z.object({
  csvText: z.string().min(1).max(2_000_000),
  idempotencyKey: idempotencyKeySchema,
}).strict();
export type ExpenseCsvImportRequest = z.infer<typeof expenseCsvImportSchema>;

export type EmailDigestFrequency = "off" | "weekly" | "monthly";
/** App-channel event toggles (in-app notifications); emailDigest stays separate. */
export type NotificationPreferenceSummary = {
  emailDigest: EmailDigestFrequency;
  expensePosted?: boolean;
  settlementClaimed?: boolean;
  inviteAccepted?: boolean;
  inviteRemind?: boolean;
  securityAlert?: boolean;
  updatedAt?: string;
};
export const updateNotificationPreferenceSchema = z
  .object({
    emailDigest: z.enum(["off", "weekly", "monthly"]),
    expensePosted: z.boolean().optional(),
    settlementClaimed: z.boolean().optional(),
    inviteAccepted: z.boolean().optional(),
    inviteRemind: z.boolean().optional(),
    securityAlert: z.boolean().optional(),
  })
  .strict();
export type UpdateNotificationPreferenceRequest = z.infer<
  typeof updateNotificationPreferenceSchema
>;

/** Soft cap for synced directory pins (matches client localStorage). */
export const UI_PINNED_WORKSPACE_CAP = 8;

/** Account-backed tour dismissals + directory pins (localStorage remains fallback on web). */
export type UiPreferenceSummary = {
  dismissShellTour: boolean;
  dismissStatementsTour: boolean;
  /** Ordered pinned workspace ids — only live memberships should be kept by clients. */
  pinnedWorkspaceIds: string[];
  updatedAt?: string;
};
export const updateUiPreferenceSchema = z
  .object({
    dismissShellTour: z.boolean().optional(),
    dismissStatementsTour: z.boolean().optional(),
    pinnedWorkspaceIds: z
      .array(z.string().uuid())
      .max(UI_PINNED_WORKSPACE_CAP)
      .optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.dismissShellTour !== undefined ||
      b.dismissStatementsTour !== undefined ||
      b.pinnedWorkspaceIds !== undefined,
    { message: "at_least_one_pref" },
  );
export type UpdateUiPreferenceRequest = z.infer<typeof updateUiPreferenceSchema>;

/**
 * Merge local and server pin lists without dropping either side.
 * Server order wins for shared ids; local-only ids are prepended (newest first).
 */
export function mergePinnedWorkspaceIds(
  localIds: readonly string[],
  serverIds: readonly string[],
  cap = UI_PINNED_WORKSPACE_CAP,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of localIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of serverIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, cap);
}

export type WorkspacePlanName = "free" | "pro" | "business";
export type WorkspacePlanSummary = {
  workspaceId: string; plan: WorkspacePlanName; seatsLimit: number | null;
  features: string[]; updatedAt?: string;
};
export const updateWorkspacePlanSchema = z.object({
  plan: z.enum(["free", "pro", "business"]),
  seatsLimit: z.number().int().positive().nullable().optional(),
  features: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
}).strict();

/**
 * Plan feature gate for `planAllows` / API `requirePlanFeature`.
 *
 * Product policy (current): **all features are free** — no premium upsell.
 * `plan` names (free/pro/business) remain for metering/admin labels only;
 * `planAllows` always returns true so API never 403s with `plan_required`.
 *
 * Documented feature ids (all unlocked on every plan):
 *   `core` | `expenses` | `settlements` | `reports` | `analytics`
 *   `costCenter` | `categoryBudget` | `biCompare` | …
 */
export const FREE_PLAN_FEATURES = [
  "core",
  "expenses",
  "settlements",
  "reports",
  "analytics",
  "costCenter",
  "categoryBudget",
  "biCompare",
] as const;

/** Always true — freemium upsell disabled; keep signature for callers/tests. */
export function planAllows(
  _plan: WorkspacePlanName,
  _feature: string,
): boolean {
  void _plan;
  void _feature;
  return true;
}

export type ApprovalWorkflowStepSummary = {
  id: string; workspaceId: string; expenseId: string; stepNo: number;
  approverUserId: string; status: "pending" | "approved" | "rejected";
  decidedAt?: string; note?: string; createdAt: string;
};
