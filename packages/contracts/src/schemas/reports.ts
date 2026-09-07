import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const reportGroupBySchema = z.enum([
  "day",
  "week",
  "month",
  "year",
  "category",
  "visibility",
]);

export const workspaceReportCompareQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    priorFrom: isoDateSchema,
    priorTo: isoDateSchema,
    groupBy: reportGroupBySchema.optional(),
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "from must be on or before to",
    path: ["to"],
  })
  .refine((value) => value.priorFrom <= value.priorTo, {
    message: "priorFrom must be on or before priorTo",
    path: ["priorTo"],
  });

export type WorkspaceReportCompareQueryInput = z.infer<
  typeof workspaceReportCompareQuerySchema
>;

export const createReportExportRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    groupBy: reportGroupBySchema.optional(),
    format: z.literal("csv").optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateReportExportRequestInput = z.infer<
  typeof createReportExportRequestSchema
>;

export const createExpenseCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(48).optional(),
    parentId: entityIdSchema.optional(),
  })
  .strict();

export type CreateExpenseCategoryRequestInput = z.infer<
  typeof createExpenseCategoryRequestSchema
>;

export const recurringCadenceSchema = z.enum(["weekly", "monthly", "yearly"]);

export const createRecurringRuleRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    amount: moneySchema,
    cadence: recurringCadenceSchema,
    nextRunOn: isoDateSchema,
    visibility: z.enum(["shared", "private", "company"]).optional(),
    categoryId: entityIdSchema.optional(),
    autoConfirm: z.boolean().optional().default(false),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateRecurringRuleRequestInput = z.infer<
  typeof createRecurringRuleRequestSchema
>;
