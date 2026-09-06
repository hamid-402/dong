import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const createAgreementRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    title: z.string().trim().min(1).max(200),
    effectiveFrom: isoDateSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateAgreementRequestInput = z.infer<typeof createAgreementRequestSchema>;

export const contributionKindSchema = z.enum(["cash", "in_kind"]);

export const recordContributionRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    agreementId: entityIdSchema,
    memberUserId: entityIdSchema,
    kind: contributionKindSchema,
    amount: moneySchema.optional(),
    description: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RecordContributionRequestInput = z.infer<
  typeof recordContributionRequestSchema
>;

export const recordPartnerLoanRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    agreementId: entityIdSchema,
    lenderUserId: entityIdSchema,
    borrowerUserId: entityIdSchema,
    principal: moneySchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RecordPartnerLoanRequestInput = z.infer<
  typeof recordPartnerLoanRequestSchema
>;

export const recordWithdrawalRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    agreementId: entityIdSchema,
    memberUserId: entityIdSchema,
    amount: moneySchema,
    reason: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RecordWithdrawalRequestInput = z.infer<
  typeof recordWithdrawalRequestSchema
>;

export const createPeriodLockRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    reason: z.string().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePeriodLockRequestInput = z.infer<typeof createPeriodLockRequestSchema>;
