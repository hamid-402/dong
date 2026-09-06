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
  })
  .strict();

export const splitMethodSchema = z.enum([
  "equal",
  "amount",
  "percent",
  "shares",
  "itemized",
]);

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
    budgetId: entityIdSchema.optional(),
    requiresApproval: z.boolean().optional(),
    visibility: z.enum(["shared", "private", "company"]).optional(),
    source: z.enum(["daily_ledger"]).nullable().optional(),
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
  });

export type CreateExpenseDraftInput = z.infer<typeof createExpenseDraftSchema>;

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
  });

export type PreviewExpenseSplitInput = z.infer<typeof previewExpenseSplitSchema>;
