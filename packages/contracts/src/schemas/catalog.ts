import { z } from "zod";
import { MAX_AMOUNT_MINOR } from "./money.js";

const minorAmountSchema = z
  .string()
  .regex(/^\d+$/, "amount_FORMAT")
  .refine(
    (v) => {
      const n = BigInt(v);
      return n > 0n && n < MAX_AMOUNT_MINOR;
    },
    { message: "amount_RANGE" },
  );

export const catalogUnitKindSchema = z.enum([
  "count",
  "weight",
  "volume",
  "length",
  "time",
  "service",
]);

export const createCatalogUnitRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[a-z][a-z0-9_]*$/, "UNIT_CODE_FORMAT"),
    labelFa: z.string().trim().min(1).max(64),
    labelEn: z.string().trim().min(1).max(64),
    kind: catalogUnitKindSchema,
    baseCode: z.string().trim().min(1).max(32).optional(),
    baseFactor: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .optional(),
  })
  .strict();

export type CreateCatalogUnitRequestInput = z.infer<typeof createCatalogUnitRequestSchema>;

export const createCatalogCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    parentId: z.string().uuid().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export type CreateCatalogCategoryRequestInput = z.infer<
  typeof createCatalogCategoryRequestSchema
>;

export const updateCatalogCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type UpdateCatalogCategoryRequestInput = z.infer<
  typeof updateCatalogCategoryRequestSchema
>;

export const createCatalogItemRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    unitCode: z.string().trim().min(1).max(32),
    referencePriceMinor: minorAmountSchema,
    description: z.string().trim().max(2000).optional(),
    categoryId: z.string().uuid().optional(),
    sku: z.string().trim().max(64).optional(),
    barcode: z.string().trim().max(64).optional(),
  })
  .strict();

export type CreateCatalogItemRequestInput = z.infer<typeof createCatalogItemRequestSchema>;

export const updateCatalogItemRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    unitCode: z.string().trim().min(1).max(32).optional(),
    referencePriceMinor: minorAmountSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    sku: z.string().trim().max(64).nullable().optional(),
    barcode: z.string().trim().max(64).nullable().optional(),
  })
  .strict();

export type UpdateCatalogItemRequestInput = z.infer<typeof updateCatalogItemRequestSchema>;

export const replaceCatalogPinsRequestSchema = z
  .object({
    itemIds: z.array(z.string().uuid()).max(200),
  })
  .strict();

export type ReplaceCatalogPinsRequestInput = z.infer<typeof replaceCatalogPinsRequestSchema>;

export const importPersonalCatalogRequestSchema = z
  .object({
    itemIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .strict();

export type ImportPersonalCatalogRequestInput = z.infer<
  typeof importPersonalCatalogRequestSchema
>;

export const listCatalogItemsQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    categoryId: z.string().uuid().optional(),
    activeOnly: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((v) => {
        if (v === undefined) return true;
        if (typeof v === "boolean") return v;
        return v === "true";
      }),
    cursor: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type ListCatalogItemsQueryInput = z.infer<typeof listCatalogItemsQuerySchema>;
