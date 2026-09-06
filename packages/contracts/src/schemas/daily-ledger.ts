import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const upsertWorkspaceDayRequestSchema = z
  .object({
    isHoliday: z.boolean().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type UpsertWorkspaceDayRequestInput = z.infer<
  typeof upsertWorkspaceDayRequestSchema
>;

export const createWorkspaceRangeLockRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    reason: z.string().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateWorkspaceRangeLockRequestInput = z.infer<
  typeof createWorkspaceRangeLockRequestSchema
>;

export const createDailyLedgerEntryRequestSchema = z
  .object({
    date: isoDateSchema,
    itemName: z.string().trim().min(1).max(200),
    amount: moneySchema,
    memberUserId: entityIdSchema.nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateDailyLedgerEntryRequestInput = z.infer<
  typeof createDailyLedgerEntryRequestSchema
>;

export const updateDailyLedgerEntryRequestSchema = z
  .object({
    itemName: z.string().trim().min(1).max(200),
    amount: moneySchema,
    idempotencyKey: idempotencyKeySchema,
    date: isoDateSchema.optional(),
    memberUserId: entityIdSchema.nullable().optional(),
  })
  .strict();

export type UpdateDailyLedgerEntryRequestInput = z.infer<
  typeof updateDailyLedgerEntryRequestSchema
>;

export const importDailyLedgerCsvRequestSchema = z
  .object({
    csv: z.string().min(1).max(2_000_000),
    idempotencyKey: idempotencyKeySchema.optional(),
  })
  .strict();

export type ImportDailyLedgerCsvRequestInput = z.infer<
  typeof importDailyLedgerCsvRequestSchema
>;
