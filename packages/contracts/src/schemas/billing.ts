import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema } from "./money.js";

export const periodKindSchema = z.enum(["day", "week", "month", "year", "custom"]);

export const createExpensePeriodRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    title: z.string().trim().min(1).max(120),
    kind: periodKindSchema,
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
    note: z.string().max(2000).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateExpensePeriodRequestInput = z.infer<
  typeof createExpensePeriodRequestSchema
>;

export const generatePeriodInvoicesRequestSchema = z
  .object({
    sendForApproval: z.boolean().optional(),
  })
  .strict();

export type GeneratePeriodInvoicesRequestInput = z.infer<
  typeof generatePeriodInvoicesRequestSchema
>;

export const closeExpensePeriodRequestSchema = z
  .object({
    requireAllPaid: z.boolean().optional(),
  })
  .strict();

export type CloseExpensePeriodRequestInput = z.infer<
  typeof closeExpensePeriodRequestSchema
>;

export const disputeInvoiceRequestSchema = z
  .object({
    note: z.string().max(2000).optional(),
  })
  .strict();

export type DisputeInvoiceRequestInput = z.infer<typeof disputeInvoiceRequestSchema>;
