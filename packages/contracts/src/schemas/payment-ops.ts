import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, moneySchema } from "./money.js";

const amountMinorPositive = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, "amountMinor must be a positive integer string");

const destLast4Schema = z
  .string()
  .trim()
  .regex(/^[0-9]{4}$/, "destLast4 must be exactly 4 digits")
  .optional();

export const createPaymentReceiptRequestSchema = z
  .object({
    settlementId: entityIdSchema.optional(),
    memberInvoiceId: entityIdSchema.optional(),
    method: z.enum(["card_to_card", "cash", "bank_transfer", "gateway"]),
    amountMinor: amountMinorPositive,
    paidAt: z.string().trim().datetime({ offset: true }),
    referenceNo: z.string().trim().min(1).max(120).optional(),
    destHolderName: z.string().trim().min(1).max(120).optional(),
    destLast4: destLast4Schema,
    attachmentId: entityIdSchema.optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.method === "card_to_card" && !data.referenceNo?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "CARD_TRANSFER_REF_REQUIRED",
        path: ["referenceNo"],
      });
    }
  });

export const rejectPaymentReceiptRequestSchema = z
  .object({
    note: z.string().trim().min(1).max(500),
  })
  .strict();

export const createPettyCashFundRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    custodianUserId: entityIdSchema.optional(),
    openingBalanceMinor: z
      .string()
      .trim()
      .regex(/^\d+$/, "openingBalanceMinor must be a non-negative integer string")
      .optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const createPettyCashMovementRequestSchema = z
  .object({
    kind: z.enum(["topup", "spend", "return", "adjust"]),
    amountMinor: z
      .string()
      .trim()
      .regex(/^-?[1-9]\d*$/, "amountMinor must be a non-zero integer string"),
    expenseId: entityIdSchema.optional(),
    settlementId: entityIdSchema.optional(),
    note: z.string().trim().max(500).optional(),
    occurredAt: z.string().trim().datetime({ offset: true }).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.kind === "spend" && !data.expenseId) {
      ctx.addIssue({
        code: "custom",
        message: "PETTY_CASH_SPEND_NEEDS_EXPENSE",
        path: ["expenseId"],
      });
    }
  });

export const topupPettyCashFromMembersRequestSchema = z
  .object({
    amountMinor: amountMinorPositive,
    splitMethod: z.enum(["equal", "amount", "percent", "shares"]).optional(),
    participantUserIds: z.array(entityIdSchema).min(1).max(100),
    splitLines: z
      .array(
        z
          .object({
            userId: entityIdSchema,
            amount: moneySchema.optional(),
            percent: z.string().trim().optional(),
            shares: z.number().positive().optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    paidByUserId: entityIdSchema.optional(),
    note: z.string().trim().max(500).optional(),
    occurredOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const spendPettyCashAsExpenseRequestSchema = z
  .object({
    amountMinor: amountMinorPositive,
    splitMethod: z.enum(["equal", "amount", "percent", "shares"]).optional(),
    participantUserIds: z.array(entityIdSchema).min(1).max(100),
    splitLines: z
      .array(
        z
          .object({
            userId: entityIdSchema,
            amount: moneySchema.optional(),
            percent: z.string().trim().optional(),
            shares: z.number().positive().optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    paidByUserId: entityIdSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    occurredOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const createCreditPurchaseRequestSchema = z
  .object({
    supplierRef: z.string().trim().min(1).max(200),
    amountMinor: amountMinorPositive,
    purchasedAt: z.string().trim().datetime({ offset: true }),
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    expenseId: entityIdSchema.optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const createCreditPurchasePaymentRequestSchema = z
  .object({
    amountMinor: amountMinorPositive,
    sourceKind: z.string().trim().min(1).max(64),
    sourceRefId: entityIdSchema.optional(),
    receiptId: entityIdSchema.optional(),
    paidAt: z.string().trim().datetime({ offset: true }).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const createOnBehalfPaymentRequestSchema = z
  .object({
    debtorUserId: entityIdSchema,
    payerUserId: entityIdSchema,
    amountMinor: amountMinorPositive,
    settlementId: entityIdSchema.optional(),
    method: z.enum(["card_to_card", "cash", "bank_transfer", "gateway"]),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .refine((v) => v.debtorUserId !== v.payerUserId, {
    message: "debtorUserId and payerUserId must differ",
    path: ["payerUserId"],
  });

export const rejectOnBehalfPaymentRequestSchema = z
  .object({
    note: z.string().trim().min(1).max(500),
  })
  .strict();

/** Runtime contract for GET …/payments/on-behalf list rows (R10-10 / D3). */
export const onBehalfPaymentSummarySchema = z
  .object({
    id: entityIdSchema,
    workspaceId: entityIdSchema,
    debtorUserId: entityIdSchema,
    payerUserId: entityIdSchema,
    amount: moneySchema,
    settlementId: entityIdSchema.optional(),
    method: z.enum(["card_to_card", "cash", "bank_transfer", "gateway"]),
    note: z.string().optional(),
    status: z.enum(["pending", "approved", "rejected"]),
    initiatedByUserId: entityIdSchema,
    approvedByUserId: entityIdSchema.optional(),
    approvedAt: z.string().optional(),
    rejectNote: z.string().optional(),
    journalEntryId: entityIdSchema.optional(),
    createdAt: z.string().min(1),
  })
  .strict();

export const onBehalfPaymentListSchema = z.array(onBehalfPaymentSummarySchema);

export type OnBehalfPaymentSummaryInput = z.infer<
  typeof onBehalfPaymentSummarySchema
>;

export type CreatePaymentReceiptRequestInput = z.infer<
  typeof createPaymentReceiptRequestSchema
>;
export type RejectPaymentReceiptRequestInput = z.infer<
  typeof rejectPaymentReceiptRequestSchema
>;
export type CreatePettyCashFundRequestInput = z.infer<
  typeof createPettyCashFundRequestSchema
>;
export type CreatePettyCashMovementRequestInput = z.infer<
  typeof createPettyCashMovementRequestSchema
>;
export type TopupPettyCashFromMembersRequestInput = z.infer<
  typeof topupPettyCashFromMembersRequestSchema
>;
export type SpendPettyCashAsExpenseRequestInput = z.infer<
  typeof spendPettyCashAsExpenseRequestSchema
>;
export type CreateCreditPurchaseRequestInput = z.infer<
  typeof createCreditPurchaseRequestSchema
>;
export type CreateCreditPurchasePaymentRequestInput = z.infer<
  typeof createCreditPurchasePaymentRequestSchema
>;
export type CreateOnBehalfPaymentRequestInput = z.infer<
  typeof createOnBehalfPaymentRequestSchema
>;
export type RejectOnBehalfPaymentRequestInput = z.infer<
  typeof rejectOnBehalfPaymentRequestSchema
>;
