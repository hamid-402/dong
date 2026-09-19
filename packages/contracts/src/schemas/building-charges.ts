import { z } from "zod";

export const generateBuildingChargesSchema = z
  .object({
    yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
    amountMinorPerUnit: z.string().regex(/^[1-9]\d*$/),
    autoPost: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

export type GenerateBuildingChargesInput = z.infer<typeof generateBuildingChargesSchema>;
