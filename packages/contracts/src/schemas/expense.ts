import { z } from "zod";
import { entityIdSchema, isoDateSchema, moneySchema } from "./money.js";

export const expenseSplitLineSchema = z
  .object({
    userId: entityIdSchema,
    amount: moneySchema,
    percent: z.string().optional(),
    shares: z.number().positive().optional(),
  })
  .strict();

export const expensePaymentLineSchema = z
  .object({
    userId: entityIdSchema,
    amount: moneySchema,
  })
  .strict();

export const expenseItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    amount: moneySchema,
    assigneeUserIds: z.array(entityIdSchema).min(1).max(50),
    sharesByUserId: z.record(z.string(), z.number().positive()).optional(),
    notes: z.string().max(500).optional(),
    catalogItemId: entityIdSchema.optional(),
    unitCode: z.string().trim().min(1).max(32).optional(),
    quantity: z.number().positive().max(1_000_000).optional(),
    unitPriceMinor: z.string().regex(/^\d+$/).optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.quantity === undefined || item.unitPriceMinor === undefined) return;
    const expected = BigInt(Math.round(item.quantity * Number(item.unitPriceMinor)));
    let actual: bigint;
    try {
      actual = BigInt(item.amount.amountMinor);
    } catch {
      ctx.addIssue({ code: "custom", message: "AMOUNT_MISMATCH", path: ["amount"] });
      return;
    }
    if (actual !== expected) {
      ctx.addIssue({ code: "custom", message: "AMOUNT_MISMATCH", path: ["amount"] });
    }
  });

export const splitMethodSchema = z.enum([
  "equal",
  "amount",
  "percent",
  "shares",
  "itemized",
  "formula",
]);

export const formulaBasisSchema = z.enum(["area", "occupancy"]);

/** Body for POST …/expenses (create draft). Extra keys rejected (.strict). */
export const createExpenseDraftSchema = z
  .object({
    workspaceId: entityIdSchema.optional(),
    title: z.string().trim().min(1).max(120),
    note: z.string().max(4000).optional(),
    total: moneySchema,
    paidByUserId: entityIdSchema,
    paymentLines: z.array(expensePaymentLineSchema).max(50).optional(),
    splitMethod: splitMethodSchema,
    participantUserIds: z.array(entityIdSchema).max(50),
    splitLines: z.array(expenseSplitLineSchema).max(50).optional(),
    items: z.array(expenseItemSchema).max(200).optional(),
    tip: moneySchema.optional(),
    tax: moneySchema.optional(),
    discount: moneySchema.optional(),
    occurredOn: isoDateSchema,
    idempotencyKey: z.string().trim().min(1).max(128),
    periodId: entityIdSchema.optional(),
    outingId: entityIdSchema.optional(),
    categoryId: entityIdSchema.optional(),
    costCenterId: entityIdSchema.optional(),
    budgetId: entityIdSchema.optional(),
    requiresApproval: z.boolean().optional(),
    visibility: z.enum(["shared", "private", "company"]).optional(),
    audience: z.enum(["all_members", "finance_and_creator"]).optional(),
    commit: z.enum(["draft", "auto"]).optional(),
    source: z.enum(["daily_ledger"]).nullable().optional(),
    originalCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
    originalAmountMinor: z.string().regex(/^[1-9]\d*$/).optional(),
    catalogItemId: entityIdSchema.optional(),
    unitCode: z.string().trim().min(1).max(32).optional(),
    quantity: z.number().positive().max(1_000_000).optional(),
    unitPriceMinor: z.string().regex(/^\d+$/).optional(),
    fundingSourceKind: z
      .enum(["petty_cash", "personal", "member", "credit"])
      .optional(),
    fundingRefId: entityIdSchema.optional(),
    tagIds: z.array(entityIdSchema).max(20).optional(),
    formulaBasis: formulaBasisSchema.optional(),
    missionKind: z.enum(["advance", "settlement"]).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.fundingSourceKind === "petty_cash" && !data.fundingRefId) {
      ctx.addIssue({
        code: "custom",
        message: "FUNDING_REF_REQUIRED",
        path: ["fundingRefId"],
      });
    }
    if (data.fundingSourceKind === "member" && !data.fundingRefId) {
      ctx.addIssue({
        code: "custom",
        message: "FUNDING_REF_REQUIRED",
        path: ["fundingRefId"],
      });
    }
    if (data.fundingRefId && !data.fundingSourceKind) {
      ctx.addIssue({
        code: "custom",
        message: "FUNDING_KIND_REQUIRED",
        path: ["fundingSourceKind"],
      });
    }
    if ((data.originalCurrency === undefined) !== (data.originalAmountMinor === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "ORIGINAL_MONEY_PAIR",
        path: ["originalCurrency"],
      });
    }
    if (data.splitMethod !== "itemized" && data.participantUserIds.length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "EXPENSE_PARTICIPANTS",
        path: ["participantUserIds"],
      });
    }
    if (data.splitMethod === "itemized" && (!data.items || data.items.length < 1)) {
      ctx.addIssue({
        code: "custom",
        message: "SPLIT_ITEMS",
        path: ["items"],
      });
    }
    if (data.splitMethod === "formula" && !data.formulaBasis) {
      ctx.addIssue({
        code: "custom",
        message: "FORMULA_BASIS_REQUIRED",
        path: ["formulaBasis"],
      });
    }
    if (data.quantity !== undefined && data.unitPriceMinor !== undefined) {
      const expected = BigInt(Math.round(data.quantity * Number(data.unitPriceMinor)));
      try {
        if (BigInt(data.total.amountMinor) !== expected) {
          ctx.addIssue({
            code: "custom",
            message: "AMOUNT_MISMATCH",
            path: ["total"],
          });
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "AMOUNT_MISMATCH",
          path: ["total"],
        });
      }
    }
  });

export const reverseExpenseRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

/**
 * Reverse then recreate in one request — same fields as create draft
 * plus optional reverseReason (workspaceId optional; taken from path).
 */
export const reviseExpenseRequestSchema = createExpenseDraftSchema.and(
  z
    .object({
      reverseReason: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
);

export type CreateExpenseDraftInput = z.infer<typeof createExpenseDraftSchema>;
export type ReverseExpenseRequestInput = z.infer<typeof reverseExpenseRequestSchema>;
export type ReviseExpenseRequestInput = z.infer<typeof reviseExpenseRequestSchema>;

export const restoreExpenseRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

export type RestoreExpenseRequestInput = z.infer<typeof restoreExpenseRequestSchema>;

/** Body for POST …/expenses/preview-split */
export const previewExpenseSplitSchema = z
  .object({
    total: moneySchema,
    splitMethod: splitMethodSchema,
    participantUserIds: z.array(entityIdSchema).max(50),
    splitLines: z.array(expenseSplitLineSchema).max(50).optional(),
    items: z.array(expenseItemSchema).max(200).optional(),
    tip: moneySchema.optional(),
    tax: moneySchema.optional(),
    discount: moneySchema.optional(),
    formulaBasis: formulaBasisSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.splitMethod !== "itemized" && data.participantUserIds.length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "EXPENSE_PARTICIPANTS",
        path: ["participantUserIds"],
      });
    }
    if (data.splitMethod === "itemized" && (!data.items || data.items.length < 1)) {
      ctx.addIssue({
        code: "custom",
        message: "SPLIT_ITEMS",
        path: ["items"],
      });
    }
    if (data.splitMethod === "formula" && !data.formulaBasis) {
      ctx.addIssue({
        code: "custom",
        message: "FORMULA_BASIS_REQUIRED",
        path: ["formulaBasis"],
      });
    }
  });

export type PreviewExpenseSplitInput = z.infer<typeof previewExpenseSplitSchema>;

/** Optional list filters for GET /workspaces/:id/expenses (additive). */
export const expenseListQuerySchema = z
  .object({
    visibility: z.enum(["shared", "private", "company"]).optional(),
    status: z.enum(["draft", "submitted", "posted", "reversed"]).optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    /** Match expense.catalogItemId or any line item catalogItemId. */
    catalogItemId: entityIdSchema.optional(),
    /** Case-insensitive substring on title (and optional notes-like fields later). */
    q: z.string().trim().min(1).max(120).optional(),
    /** Primary payer user id (paidByUserId or any paymentLines[].userId). */
    paidByUserId: entityIdSchema.optional(),
    /** Expense category id. */
    categoryId: entityIdSchema.optional(),
    /** Filter expenses that include this tag id. */
    tagId: entityIdSchema.optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from > q.to) {
      ctx.addIssue({
        code: "custom",
        message: "FROM_AFTER_TO",
        path: ["from"],
      });
    }
  });

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export const rebuildFundPartyJournalsRequestSchema = z.preprocess(
  (val) => (val == null || val === "" ? {} : val),
  z
    .object({
      /**
       * Re-post even when journal already has fund:* lines.
       * Default false = idempotent migration.
       */
      force: z.boolean().optional().default(false),
    })
    .strict(),
);

export type RebuildFundPartyJournalsRequest = z.infer<
  typeof rebuildFundPartyJournalsRequestSchema
>;

export const rebuildFundPartyJournalsResultSchema = z
  .object({
    rebuilt: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    totalPosted: z.number().int().nonnegative(),
    skippedAlreadyFund: z.number().int().nonnegative(),
    skippedNoFund: z.number().int().nonnegative(),
    forced: z.boolean(),
  })
  .strict();
