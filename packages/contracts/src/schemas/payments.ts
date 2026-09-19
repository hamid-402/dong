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

/** Body optional — verify never trusts client amount. */
export const localPspVerifyRequestSchema = z
  .object({
    /** Ignored if present; amount is server-owned. */
    amountMinor: z.string().optional(),
  })
  .strict();

export type LocalPspVerifyRequestInput = z.infer<
  typeof localPspVerifyRequestSchema
>;

/** Runtime contract for GET /api/v1/payments/local/intents/:intentId (R10-10 / D3). */
export const localPspIntentSummarySchema = z
  .object({
    intentId: z.string().trim().min(1),
    provider: z.literal("local_psp"),
    amount: moneySchema,
    description: z.string(),
    status: z.enum(["pending", "verified", "expired"]),
    returnUrl: z.string().min(1),
    createdAt: z.string().min(1),
    expiresAt: z.string().min(1),
    verifiedAt: z.string().optional(),
    refId: z.string().optional(),
  })
  .strict();

export type LocalPspIntentSummaryInput = z.infer<
  typeof localPspIntentSummarySchema
>;

export const localPspVerifyResponseSchema = z
  .object({
    ok: z.boolean(),
    status: z.enum(["verified", "pending", "expired", "unknown"]),
    intentId: z.string().trim().min(1),
    amount: moneySchema,
    refId: z.string().optional(),
    returnUrl: z.string().min(1),
  })
  .strict();

export type LocalPspVerifyResponseInput = z.infer<
  typeof localPspVerifyResponseSchema
>;
