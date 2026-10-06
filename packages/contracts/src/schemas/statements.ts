import { z } from "zod";
import { inspectPayoutDestination } from "../iranian-bank.js";
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
    format: z.enum(["csv", "json", "xlsx", "html_print"]),
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "from must be <= to" });

export const createStatementPackExportRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    format: z.enum(["xlsx", "csv", "html_print", "pdf"]),
    /** Optional formal overrides — only applied when provided (no fake letterhead). */
    documentNo: z.string().trim().min(1).max(80).optional(),
    kindDocumentTitle: z.string().trim().min(1).max(120).optional(),
    letterheadNote: z.string().trim().min(1).max(200).optional(),
    footerNote: z.string().trim().min(1).max(300).optional(),
    sealLabel: z.string().trim().min(1).max(120).optional(),
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

export const upsertWorkspacePayoutInstructionsSchema = z
  .object({
    holderName: z.string().trim().min(2).max(120),
    destinationKind: z.enum(["card", "iban"]),
    destinationValue: z.string().trim().min(2).max(40),
    bankName: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const inspected = inspectPayoutDestination(body.destinationKind, body.destinationValue);
    if (!inspected.formatOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          body.destinationKind === "card"
            ? "destinationValue must be a 16-digit card number"
            : "destinationValue must be IR + 24 digits",
        path: ["destinationValue"],
      });
      return;
    }
    if (!inspected.checkOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          body.destinationKind === "card"
            ? "card check digit is invalid"
            : "iban check digits are invalid",
        path: ["destinationValue"],
      });
    }
  })
  .transform((body) => {
    const inspected = inspectPayoutDestination(body.destinationKind, body.destinationValue);
    const typedName = body.bankName?.trim();
    const bankName = typedName || inspected.bank?.nameFa;
    return {
      holderName: body.holderName,
      destinationKind: body.destinationKind,
      destinationValue: inspected.normalized,
      ...(bankName ? { bankName } : {}),
    };
  });

export type StatementListQueryInput = z.infer<typeof statementListQuerySchema>;
export type StatementDetailQueryInput = z.infer<typeof statementDetailQuerySchema>;
export type CreateStatementExportRequestInput = z.infer<
  typeof createStatementExportRequestSchema
>;
export type CreateStatementPackExportRequestInput = z.infer<
  typeof createStatementPackExportRequestSchema
>;
export type StatementNotifyRequestInput = z.infer<typeof statementNotifyRequestSchema>;
export type UpsertWorkspacePayoutInstructionsInput = z.infer<
  typeof upsertWorkspacePayoutInstructionsSchema
>;
