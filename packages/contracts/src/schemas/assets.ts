import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema } from "./money.js";

export const createAssetFromDeliveryRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    deliveryId: entityIdSchema,
    title: z.string().trim().min(1).max(200),
    serialNumber: z.string().trim().min(1).max(120).optional(),
    ownerUserId: entityIdSchema.optional(),
    custodianUserId: entityIdSchema.optional(),
    location: z.string().trim().min(1).max(200).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateAssetFromDeliveryRequestInput = z.infer<
  typeof createAssetFromDeliveryRequestSchema
>;

export const assignAssetRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    assetId: entityIdSchema,
    ownerUserId: entityIdSchema.optional(),
    custodianUserId: entityIdSchema.optional(),
    location: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type AssignAssetRequestInput = z.infer<typeof assignAssetRequestSchema>;

export const transferAssetRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    assetId: entityIdSchema,
    toCustodianUserId: entityIdSchema,
    location: z.string().trim().min(1).max(200).optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type TransferAssetRequestInput = z.infer<typeof transferAssetRequestSchema>;

export const returnAssetRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    assetId: entityIdSchema,
    note: z.string().max(2000).optional(),
  })
  .strict();

export type ReturnAssetRequestInput = z.infer<typeof returnAssetRequestSchema>;

export const damageAssetRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    assetId: entityIdSchema,
    note: z.string().max(2000).optional(),
  })
  .strict();

export type DamageAssetRequestInput = z.infer<typeof damageAssetRequestSchema>;
