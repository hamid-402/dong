import { z } from "zod";
import {
  entityIdSchema,
  idempotencyKeySchema,
  isoDateSchema,
  moneySchema,
  nonNegativeMoneySchema,
  yearMonthSchema,
} from "./money.js";

export const personalMoneyAccountKindSchema = z.enum([
  "cash",
  "bank",
  "card",
  "other",
]);

export const createPersonalMoneyAccountRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: personalMoneyAccountKindSchema,
    openingBalance: nonNegativeMoneySchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePersonalMoneyAccountRequestInput = z.infer<
  typeof createPersonalMoneyAccountRequestSchema
>;

export const updatePersonalMoneyAccountRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export type UpdatePersonalMoneyAccountRequestInput = z.infer<
  typeof updatePersonalMoneyAccountRequestSchema
>;

export const createPersonalMoneyTxnRequestSchema = z
  .object({
    accountId: entityIdSchema,
    kind: z.enum(["income", "expense", "adjustment"]),
    amount: moneySchema,
    occurredOn: isoDateSchema,
    note: z.string().max(2000).optional(),
    categoryId: entityIdSchema.optional(),
    linkedWorkspaceId: entityIdSchema.optional(),
    linkedExpenseId: entityIdSchema.optional(),
    linkedSettlementId: entityIdSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePersonalMoneyTxnRequestInput = z.infer<
  typeof createPersonalMoneyTxnRequestSchema
>;

export const createPersonalTransferRequestSchema = z
  .object({
    fromAccountId: entityIdSchema,
    toAccountId: entityIdSchema,
    amount: moneySchema,
    occurredOn: isoDateSchema,
    note: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePersonalTransferRequestInput = z.infer<
  typeof createPersonalTransferRequestSchema
>;

export const upsertPersonalBudgetRequestSchema = z
  .object({
    yearMonth: yearMonthSchema,
    limit: moneySchema,
    alertPercent: z.number().int().min(1).max(100).optional(),
    note: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type UpsertPersonalBudgetRequestInput = z.infer<
  typeof upsertPersonalBudgetRequestSchema
>;

export const createPersonalCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(48).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePersonalCategoryRequestInput = z.infer<
  typeof createPersonalCategoryRequestSchema
>;

export const updatePersonalCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    slug: z.string().trim().min(1).max(48).optional(),
  })
  .strict();

export type UpdatePersonalCategoryRequestInput = z.infer<
  typeof updatePersonalCategoryRequestSchema
>;

export const createPersonalFinanceExportRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    kind: z.enum(["transactions", "overview"]),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePersonalFinanceExportRequestInput = z.infer<
  typeof createPersonalFinanceExportRequestSchema
>;

export const incomeSourceKindSchema = z.enum([
  "salary",
  "bonus",
  "freelance",
  "rent",
  "other",
]);

export const incomeCadenceSchema = z.enum([
  "monthly",
  "weekly",
  "yearly",
  "irregular",
]);

export const createIncomeSourceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: incomeSourceKindSchema,
    expected: nonNegativeMoneySchema.optional(),
    cadence: incomeCadenceSchema.optional(),
    active: z.boolean().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateIncomeSourceRequestInput = z.infer<
  typeof createIncomeSourceRequestSchema
>;

export const updateIncomeSourceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    kind: incomeSourceKindSchema.optional(),
    expected: nonNegativeMoneySchema.nullable().optional(),
    cadence: incomeCadenceSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type UpdateIncomeSourceRequestInput = z.infer<
  typeof updateIncomeSourceRequestSchema
>;

export const createSavingsGoalRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    targetMinor: z
      .string()
      .regex(/^\d+$/)
      .refine((v) => BigInt(v) > 0n, { message: "target_RANGE" }),
    targetDate: isoDateSchema.optional(),
    accountId: entityIdSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSavingsGoalRequestInput = z.infer<
  typeof createSavingsGoalRequestSchema
>;

export const updateSavingsGoalRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    targetMinor: z
      .string()
      .regex(/^\d+$/)
      .refine((v) => BigInt(v) > 0n, { message: "target_RANGE" })
      .optional(),
    targetDate: isoDateSchema.nullable().optional(),
    accountId: entityIdSchema.nullable().optional(),
    status: z.enum(["active", "reached", "archived"]).optional(),
  })
  .strict();

export type UpdateSavingsGoalRequestInput = z.infer<
  typeof updateSavingsGoalRequestSchema
>;

export const createSavingsGoalContributionRequestSchema = z
  .object({
    amountMinor: z
      .string()
      .regex(/^\d+$/)
      .refine((v) => BigInt(v) > 0n, { message: "amount_RANGE" }),
    occurredAt: z.string().trim().min(1).max(40),
    txnId: entityIdSchema.optional(),
    note: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSavingsGoalContributionRequestInput = z.infer<
  typeof createSavingsGoalContributionRequestSchema
>;

export const spendingAlertScopeSchema = z.enum([
  "total",
  "category",
  "group",
  "workspace",
]);

export const putSpendingAlertsRequestSchema = z
  .object({
    alerts: z
      .array(
        z
          .object({
            id: entityIdSchema.optional(),
            scope: spendingAlertScopeSchema,
            refId: entityIdSchema.nullable().optional(),
            period: z.enum(["month", "week"]).optional(),
            limitMinor: z
              .string()
              .regex(/^\d+$/)
              .refine((v) => BigInt(v) > 0n, { message: "limit_RANGE" }),
            thresholdPercent: z.number().int().min(1).max(100).optional(),
            channel: z.enum(["inapp", "email"]).optional(),
            active: z.boolean().optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export type PutSpendingAlertsRequestInput = z.infer<
  typeof putSpendingAlertsRequestSchema
>;

export const recomputeMonthlyCloseRequestSchema = z
  .object({
    yearMonth: yearMonthSchema,
  })
  .strict();

export type RecomputeMonthlyCloseRequestInput = z.infer<
  typeof recomputeMonthlyCloseRequestSchema
>;

export const personalFinanceOverviewScopeSchema = z.enum([
  "personal",
  "group",
  "combined",
]);
