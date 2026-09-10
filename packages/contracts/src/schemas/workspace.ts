import { z } from "zod";

export const workspaceTemplateSchema = z.enum([
  "personal",
  "friends_family",
  "household",
  "project_partners",
  "small_team",
  "construction",
]);

export const membershipRoleSchema = z.enum([
  "owner",
  "admin",
  "finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
  "guest",
]);

export const createWorkspaceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_FORMAT"),
    template: workspaceTemplateSchema,
  })
  .strict();

export type CreateWorkspaceRequestInput = z.infer<typeof createWorkspaceRequestSchema>;

export const updateWorkspaceRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    timezone: z.string().trim().min(1).max(64),
    displayUnit: z.enum(["toman", "rial"]),
  })
  .strict();

export type UpdateWorkspaceRequestInput = z.infer<typeof updateWorkspaceRequestSchema>;

export const createInviteRequestSchema = z
  .object({
    role: membershipRoleSchema,
    invitedSubject: z.string().trim().min(1).max(320).optional(),
    expiresInHours: z.number().positive().max(24 * 30).optional(),
  })
  .strict();

export type CreateInviteRequestInput = z.infer<typeof createInviteRequestSchema>;

export const acceptInviteRequestSchema = z
  .object({
    token: z.string().trim().min(1).max(512),
  })
  .strict();

export type AcceptInviteRequestInput = z.infer<typeof acceptInviteRequestSchema>;
