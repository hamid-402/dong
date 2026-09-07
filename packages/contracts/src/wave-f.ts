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
export type NotificationPreferenceSummary = { emailDigest: EmailDigestFrequency; updatedAt?: string };
export const updateNotificationPreferenceSchema = z.object({
  emailDigest: z.enum(["off", "weekly", "monthly"]),
}).strict();

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
export function planAllows(plan: WorkspacePlanName, feature: string): boolean {
  if (["core", "expenses", "settlements", "reports"].includes(feature)) return true;
  return plan === "pro" || plan === "business";
}

export type ApprovalWorkflowStepSummary = {
  id: string; workspaceId: string; expenseId: string; stepNo: number;
  approverUserId: string; status: "pending" | "approved" | "rejected";
  decidedAt?: string; note?: string; createdAt: string;
};
