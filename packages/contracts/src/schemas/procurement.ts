import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const createNeedRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000).optional(),
    estimatedAmount: moneySchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateNeedRequestInput = z.infer<typeof createNeedRequestSchema>;

export const createPurchaseRequestRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    needId: entityIdSchema.optional(),
    title: z.string().trim().min(1).max(200),
    amount: moneySchema,
    vendorName: z.string().trim().min(1).max(200).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePurchaseRequestRequestInput = z.infer<
  typeof createPurchaseRequestRequestSchema
>;

export const submitApprovalRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    purchaseRequestId: entityIdSchema,
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type SubmitApprovalRequestInput = z.infer<typeof submitApprovalRequestSchema>;

export const createBudgetRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    name: z.string().trim().min(1).max(120),
    ceiling: moneySchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateBudgetRequestInput = z.infer<typeof createBudgetRequestSchema>;

export const createVendorRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    name: z.string().trim().min(1).max(200),
    contactPhone: z.string().trim().min(1).max(40).optional(),
    contactEmail: z.string().trim().email().max(320).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateVendorRequestInput = z.infer<typeof createVendorRequestSchema>;

export const createPurchaseOrderRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    purchaseRequestId: entityIdSchema,
    vendorId: entityIdSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreatePurchaseOrderRequestInput = z.infer<
  typeof createPurchaseOrderRequestSchema
>;

export const recordDeliveryRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    purchaseOrderId: entityIdSchema,
    expectedQuantity: z.number().positive().finite(),
    receivedQuantity: z.number().nonnegative().finite(),
    discrepancyNote: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RecordDeliveryRequestInput = z.infer<typeof recordDeliveryRequestSchema>;
