import { z } from "zod";

export const workspaceTemplateSchema = z.enum([
  "personal",
  "friends_family",
  "household",
  "project_partners",
  "small_team",
  "construction",
  "residential_building",
]);

export const membershipRoleSchema = z.enum([
  "owner",
  "admin",
  "finance",
  "deputy_finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
  "guest",
]);

export const workspaceSubunitKindSchema = z.enum([
  "unit",
  "department",
  "subsidiary",
]);

export const createWorkspaceSubunitSchema = z
  .object({
    kind: workspaceSubunitKindSchema,
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9._\-]+$/, "subunit_code_FORMAT"),
    name: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    areaSqm: z.number().positive().max(1_000_000).optional(),
    occupancy: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();

export type CreateWorkspaceSubunitInput = z.infer<typeof createWorkspaceSubunitSchema>;

export const updateWorkspaceSubunitSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    memberUserIds: z.array(z.string().uuid()).max(200).optional(),
    areaSqm: z.number().positive().max(1_000_000).nullable().optional(),
    occupancy: z.number().int().min(1).max(10_000).nullable().optional(),
  })
  .strict();

export type UpdateWorkspaceSubunitInput = z.infer<typeof updateWorkspaceSubunitSchema>;

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
    ownerDefaultShares: z.number().int().positive().max(100).optional(),
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
