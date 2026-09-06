import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema } from "./money.js";

export const commentTargetTypeSchema = z.enum([
  "expense",
  "settlement",
  "need",
  "purchase_request",
]);

export const attachmentKindSchema = z.enum(["receipt", "document", "photo"]);

export const allowedUploadMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const createCommentRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    targetType: commentTargetTypeSchema,
    targetId: entityIdSchema,
    body: z.string().trim().min(1).max(8000),
  })
  .strict();

export type CreateCommentRequestInput = z.infer<typeof createCommentRequestSchema>;

export const createAttachmentRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    targetType: commentTargetTypeSchema,
    targetId: entityIdSchema,
    kind: attachmentKindSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: allowedUploadMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
    contentHash: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/, "contentHash_FORMAT"),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateAttachmentRequestInput = z.infer<
  typeof createAttachmentRequestSchema
>;

export const uploadAttachmentContentRequestSchema = z
  .object({
    contentBase64: z.string().trim().min(1).max(14_000_000),
  })
  .strict();

export type UploadAttachmentContentRequestInput = z.infer<
  typeof uploadAttachmentContentRequestSchema
>;
