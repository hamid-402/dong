import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, moneySchema } from "./money.js";

export const createPaymentLinkRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    settlementId: entityIdSchema.optional(),
    invoiceId: entityIdSchema.optional(),
    amount: moneySchema,
    description: z.string().trim().min(1).max(500),
    returnUrl: z.string().trim().url().max(2048),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePaymentLinkRequestInput = z.infer<
  typeof createPaymentLinkRequestSchema
>;
