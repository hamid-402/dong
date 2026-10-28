import { z } from "zod";
import { PAYMENT_RECEIPT_MAX_BYTES } from "../payment-ops.js";
import { entityIdSchema, idempotencyKeySchema } from "./money.js";

export const commentTargetTypeSchema = z.enum([
  "expense",
  "settlement",
  "need",
  "purchase_request",
  "payment_receipt",
]);

export const attachmentKindSchema = z.enum(["receipt", "document", "photo"]);

export const allowedUploadMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Payment-evidence targets only (not expense). */
export const paymentReceiptAttachmentTargetTypeSchema = z.enum([
  "payment_receipt",
  "settlement",
]);

export const paymentReceiptUploadMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

/**
 * Max base64 character length for PAYMENT_RECEIPT_MAX_BYTES raw bytes
 * (4/3 expansion + padding slack).
 */
export const PAYMENT_RECEIPT_CONTENT_BASE64_MAX =
  Math.ceil((PAYMENT_RECEIPT_MAX_BYTES * 4) / 3) + 4;

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

/** Dedicated payment-receipt create — 5MB sizeBytes; does not change general create schema. */
export const createPaymentReceiptAttachmentRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    targetType: paymentReceiptAttachmentTargetTypeSchema,
    targetId: entityIdSchema,
    kind: z.literal("receipt"),
    fileName: z.string().trim().min(1).max(255),
    mimeType: paymentReceiptUploadMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(PAYMENT_RECEIPT_MAX_BYTES),
    contentHash: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{64}$/, "contentHash_FORMAT"),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePaymentReceiptAttachmentRequestInput = z.infer<
  typeof createPaymentReceiptAttachmentRequestSchema
>;

/** Dedicated payment-receipt content upload — contentBase64 sized for 5MB raw. */
export const uploadPaymentReceiptContentRequestSchema = z
  .object({
    contentBase64: z
      .string()
      .trim()
      .min(1)
      .max(PAYMENT_RECEIPT_CONTENT_BASE64_MAX),
  })
  .strict();

export type UploadPaymentReceiptContentRequestInput = z.infer<
  typeof uploadPaymentReceiptContentRequestSchema
>;
