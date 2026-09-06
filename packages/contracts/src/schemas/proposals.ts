import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, moneySchema } from "./money.js";

export const proposalKindSchema = z.enum(["goods", "service"]);
export const proposalVoteChoiceSchema = z.enum(["yes", "no"]);

export const updateProposalSettingsRequestSchema = z
  .object({
    quorumPercent: z.number().int().min(1).max(100),
  })
  .strict();

export type UpdateProposalSettingsRequestInput = z.infer<
  typeof updateProposalSettingsRequestSchema
>;

export const createProposalRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    kind: proposalKindSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).optional(),
    estimatedAmount: moneySchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateProposalRequestInput = z.infer<typeof createProposalRequestSchema>;

export const castProposalVoteRequestSchema = z
  .object({
    choice: proposalVoteChoiceSchema,
  })
  .strict();

export type CastProposalVoteRequestInput = z.infer<typeof castProposalVoteRequestSchema>;
