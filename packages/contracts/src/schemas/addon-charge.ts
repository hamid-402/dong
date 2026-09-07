import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, moneySchema } from "./money.js";

export const createPersonalAddonChargeRequestSchema = z
  .object({
    targetMemberUserId: entityIdSchema,
    amount: moneySchema,
    title: z.string().trim().min(1).max(120),
    note: z.string().trim().max(2000).optional(),
    categoryId: entityIdSchema.optional(),
    linkedExpenseId: entityIdSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePersonalAddonChargeRequestInput = z.infer<
  typeof createPersonalAddonChargeRequestSchema
>;

export const disputePersonalAddonChargeRequestSchema = z
  .object({
    note: z.string().trim().max(2000).optional(),
  })
  .strict()
  .default({});

export type DisputePersonalAddonChargeRequestInput = z.infer<
  typeof disputePersonalAddonChargeRequestSchema
>;
