import { z } from "zod";
import { membershipRoleSchema } from "./workspace.js";

export const addWorkspaceMemberRequestSchema = z
  .object({
    userId: z.string().uuid(),
    role: membershipRoleSchema,
    defaultShares: z.number().int().positive().max(100).optional(),
  })
  .strict();

export type AddWorkspaceMemberRequestInput = z.infer<
  typeof addWorkspaceMemberRequestSchema
>;

export const updateWorkspaceMemberRequestSchema = z
  .object({
    role: membershipRoleSchema.optional(),
    defaultShares: z.number().int().positive().max(100).optional(),
  })
  .strict()
  .refine((body) => body.role !== undefined || body.defaultShares !== undefined, {
    message: "role_or_defaultShares_required",
  });

export type UpdateWorkspaceMemberRequestInput = z.infer<
  typeof updateWorkspaceMemberRequestSchema
>;

export const disableWorkspaceMemberRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type DisableWorkspaceMemberRequestInput = z.infer<
  typeof disableWorkspaceMemberRequestSchema
>;

export const createJoinRequestSchema = z
  .object({
    message: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateJoinRequestInput = z.infer<typeof createJoinRequestSchema>;

export const approveJoinRequestSchema = z
  .object({
    role: membershipRoleSchema,
  })
  .strict();

export type ApproveJoinRequestInput = z.infer<typeof approveJoinRequestSchema>;

export const proposeOwnershipTransferSchema = z
  .object({
    toUserId: z.string().uuid(),
  })
  .strict();

export type ProposeOwnershipTransferInput = z.infer<
  typeof proposeOwnershipTransferSchema
>;
