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
