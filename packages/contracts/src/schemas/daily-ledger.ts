import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

const catalogLineFieldsSchema = {
  catalogItemId: entityIdSchema.optional(),
  unitCode: z.string().trim().min(1).max(32).optional(),
  quantity: z.number().positive().max(1_000_000).optional(),
  unitPriceMinor: z.string().regex(/^\d+$/).optional(),
};

function refineAmountMatchesQuantity(
  data: {
    amount: { amountMinor: string };
    quantity?: number;
    unitPriceMinor?: string;
  },
  ctx: z.RefinementCtx,
  amountPath: PropertyKey[] = ["amount"],
): void {
  if (data.quantity === undefined || data.unitPriceMinor === undefined) return;
  const expected = BigInt(Math.round(data.quantity * Number(data.unitPriceMinor)));
  let actual: bigint;
  try {
    actual = BigInt(data.amount.amountMinor);
  } catch {
    ctx.addIssue({ code: "custom", message: "AMOUNT_MISMATCH", path: amountPath });
    return;
  }
  if (actual !== expected) {
    ctx.addIssue({ code: "custom", message: "AMOUNT_MISMATCH", path: amountPath });
  }
}

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
    ...catalogLineFieldsSchema,
  })
  .strict()
  .superRefine((data, ctx) => refineAmountMatchesQuantity(data, ctx));

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
    ...catalogLineFieldsSchema,
  })
  .strict()
  .superRefine((data, ctx) => refineAmountMatchesQuantity(data, ctx));

export type UpdateDailyLedgerEntryRequestInput = z.infer<
  typeof updateDailyLedgerEntryRequestSchema
>;

export const ledgerDayLineSchema = z
  .object({
    itemName: z.string().trim().min(1).max(200),
    amount: moneySchema,
    memberUserId: entityIdSchema.nullable().optional(),
    ...catalogLineFieldsSchema,
  })
  .strict()
  .superRefine((data, ctx) => refineAmountMatchesQuantity(data, ctx));

export const postLedgerDayRequestSchema = z
  .object({
    date: isoDateSchema,
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(ledgerDayLineSchema).min(1).max(200),
  })
  .strict();

export type PostLedgerDayRequestInput = z.infer<typeof postLedgerDayRequestSchema>;

export const importDailyLedgerCsvRequestSchema = z
  .object({
    csv: z.string().min(1).max(2_000_000),
    idempotencyKey: idempotencyKeySchema.optional(),
  })
  .strict();

export type ImportDailyLedgerCsvRequestInput = z.infer<
  typeof importDailyLedgerCsvRequestSchema
>;
