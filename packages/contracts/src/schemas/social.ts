import { z } from "zod";

export const updateDirectoryPrivacyRequestSchema = z
  .object({
    findableByUsername: z.boolean().optional(),
    findableByPhone: z.boolean().optional(),
    allowFriendRequests: z.boolean().optional(),
    allowGroupInvites: z.boolean().optional(),
  })
  .strict();

export type UpdateDirectoryPrivacyRequestInput = z.infer<
  typeof updateDirectoryPrivacyRequestSchema
>;

export const createFriendRequestSchema = z
  .object({
    targetUserId: z.string().uuid(),
    note: z.string().trim().max(280).optional(),
  })
  .strict();

export type CreateFriendRequestInput = z.infer<typeof createFriendRequestSchema>;

export const contactMatchRequestSchema = z
  .object({
    phones: z.array(z.string().trim().min(4).max(24)).max(500),
  })
  .strict();

export type ContactMatchRequestInput = z.infer<typeof contactMatchRequestSchema>;
