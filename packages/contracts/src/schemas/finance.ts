import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const createOutingRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    occurredOn: isoDateSchema,
    note: z.string().max(4000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateOutingRequestInput = z.infer<typeof createOutingRequestSchema>;

export const createSettlementClaimRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    fromUserId: entityIdSchema,
    toUserId: entityIdSchema,
    amount: moneySchema,
    note: z.string().max(2000).optional(),
    paymentLinkUrl: z.string().trim().url().max(2048).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSettlementClaimRequestInput = z.infer<
  typeof createSettlementClaimRequestSchema
>;

export const updateMemberDefaultSharesRequestSchema = z
  .object({
    defaultShares: z.number().int().positive().max(100),
  })
  .strict();

export type UpdateMemberDefaultSharesRequestInput = z.infer<
  typeof updateMemberDefaultSharesRequestSchema
>;
