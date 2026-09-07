import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const createCostCenterRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(48),
  })
  .strict();

export type CreateCostCenterRequestInput = z.infer<
  typeof createCostCenterRequestSchema
>;

export const createMemberAllowanceRequestSchema = z
  .object({
    memberUserId: entityIdSchema,
    periodKind: z.enum(["week", "month"]),
    limit: moneySchema,
    alertPct: z.number().int().min(1).max(100).default(80),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (BigInt(value.limit.amountMinor) <= 0n) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limit", "amountMinor"],
        message: "Allowance limit must be positive",
      });
    }
  });

export type CreateMemberAllowanceRequestInput = z.infer<
  typeof createMemberAllowanceRequestSchema
>;

const nullablePositiveMinorSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) > 0n, "Must be a positive minor-unit integer")
  .nullable();

export const updateWorkspaceExpensePolicyRequestSchema = z
  .object({
    approvalThresholdMinor: nullablePositiveMinorSchema,
    requireReceiptAboveMinor: nullablePositiveMinorSchema,
  })
  .strict();

export type UpdateWorkspaceExpensePolicyRequestInput = z.infer<
  typeof updateWorkspaceExpensePolicyRequestSchema
>;

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

export const createSimplifySettlementClaimsRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSimplifySettlementClaimsRequestInput = z.infer<
  typeof createSimplifySettlementClaimsRequestSchema
>;

export const updateMemberDefaultSharesRequestSchema = z
  .object({
    defaultShares: z.number().int().positive().max(100),
  })
  .strict();

export type UpdateMemberDefaultSharesRequestInput = z.infer<
  typeof updateMemberDefaultSharesRequestSchema
>;
