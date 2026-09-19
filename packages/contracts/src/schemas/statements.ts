import { z } from "zod";
import { entityIdSchema, isoDateSchema } from "./money.js";

export const statementGranularitySchema = z.enum(["day", "period"]);

export const statementListQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    granularity: statementGranularitySchema.optional().default("period"),
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must be <= to" });

export const statementDetailQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must be <= to" });

export const createStatementExportRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    format: z.enum(["csv", "json"]),
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must be <= to" });

export const statementNotifyRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must be <= to" });

export const statementUserIdParamSchema = entityIdSchema;

const cardDestinationSchema = z
  .string()
  .trim()
  .regex(/^\d{16}$/, "card must be 16 digits");

const ibanDestinationSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^IR\d{24}$/, "iban must be IR + 24 digits");

export const upsertWorkspacePayoutInstructionsSchema = z
  .object({
    holderName: z.string().trim().min(2).max(120),
    destinationKind: z.enum(["card", "iban"]),
    destinationValue: z.string().trim().min(2).max(34),
    bankName: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.destinationKind === "card") {
      const parsed = cardDestinationSchema.safeParse(body.destinationValue);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "destinationValue must be a 16-digit card number",
          path: ["destinationValue"],
        });
      }
      return;
    }
    const parsed = ibanDestinationSchema.safeParse(body.destinationValue);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "destinationValue must be IR + 24 digits",
        path: ["destinationValue"],
      });
    }
  });

export type StatementListQueryInput = z.infer<typeof statementListQuerySchema>;
export type StatementDetailQueryInput = z.infer<typeof statementDetailQuerySchema>;
export type CreateStatementExportRequestInput = z.infer<
  typeof createStatementExportRequestSchema
>;
export type StatementNotifyRequestInput = z.infer<typeof statementNotifyRequestSchema>;
export type UpsertWorkspacePayoutInstructionsInput = z.infer<
  typeof upsertWorkspacePayoutInstructionsSchema
>;
