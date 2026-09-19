import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

export const createCostCenterRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(48),
  })
  .strict();

export type CreateCostCenterRequestInput = z.infer<
  typeof createCostCenterRequestSchema
>;

export const createMemberAllowanceRequestSchema = z
  .object({
    memberUserId: entityIdSchema,
    periodKind: z.enum(["week", "month"]),
    limit: moneySchema,
    alertPct: z.number().int().min(1).max(100).default(80),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (BigInt(value.limit.amountMinor) <= 0n) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limit", "amountMinor"],
        message: "Allowance limit must be positive",
      });
    }
  });

export type CreateMemberAllowanceRequestInput = z.infer<
  typeof createMemberAllowanceRequestSchema
>;

const nullablePositiveMinorSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) > 0n, "Must be a positive minor-unit integer")
  .nullable();

const approvalTierSchema = z
  .object({
    minAmountMinor: z.string().regex(/^\d+$/),
    requiredApprovals: z.number().int().min(1).max(10),
    requiredRoles: z.array(z.string().trim().min(1).max(32)).max(5).optional(),
  })
  .strict();

export const updateWorkspaceExpensePolicyRequestSchema = z
  .object({
    approvalThresholdMinor: nullablePositiveMinorSchema,
    requireReceiptAboveMinor: nullablePositiveMinorSchema,
    requireReceiptCategoryIds: z.array(entityIdSchema).max(50).optional(),
    requireCostCenter: z.boolean().optional(),
    approvalTiers: z.array(approvalTierSchema).max(20).nullable().optional(),
    perDiemDailyMinor: nullablePositiveMinorSchema.optional(),
  })
  .strict();

export type UpdateWorkspaceExpensePolicyRequestInput = z.infer<
  typeof updateWorkspaceExpensePolicyRequestSchema
>;

export const createOutingRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    occurredOn: isoDateSchema,
    note: z.string().max(4000).optional(),
    idempotencyKey: idempotencyKeySchema,
    budgetCapMinor: z
      .string()
      .regex(/^\d+$/)
      .refine((v) => BigInt(v) > 0n, "Must be positive")
      .optional(),
    startsOn: isoDateSchema.optional(),
    endsOn: isoDateSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startsOn && value.endsOn && value.startsOn > value.endsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "ENDS_BEFORE_STARTS",
      });
    }
  });

export type CreateOutingRequestInput = z.infer<typeof createOutingRequestSchema>;

export const createSettlementClaimRequestSchema = z
  .object({
    workspaceId: entityIdSchema,
    fromUserId: entityIdSchema,
    toUserId: entityIdSchema,
    amount: moneySchema,
    note: z.string().max(2000).optional(),
    paymentLinkUrl: z.string().trim().url().max(2048).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSettlementClaimRequestInput = z.infer<
  typeof createSettlementClaimRequestSchema
>;

export const createSimplifySettlementClaimsRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSimplifySettlementClaimsRequestInput = z.infer<
  typeof createSimplifySettlementClaimsRequestSchema
>;

export const confirmSimplifySettlementClaimsRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    settlementIds: z.array(entityIdSchema).max(200).optional(),
  })
  .strict();

export type ConfirmSimplifySettlementClaimsRequestInput = z.infer<
  typeof confirmSimplifySettlementClaimsRequestSchema
>;

/** Body for POST …/settlements/:id/confirm — evidence when flag enabled. */
export const confirmSettlementRequestSchema = z.preprocess(
  (value) => (value == null ? {} : value),
  z
    .object({
      evidenceKind: z.enum(["receipt", "cash_ack", "gateway"]).optional(),
      /** Approved payment receipt linked to this settlement. */
      receiptId: entityIdSchema.optional(),
      /** Free-text acknowledgment when settled in cash / in person. */
      cashAckNote: z.string().trim().min(3).max(500).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.evidenceKind === "receipt" && !data.receiptId) {
        ctx.addIssue({
          code: "custom",
          message: "RECEIPT_ID_REQUIRED",
          path: ["receiptId"],
        });
      }
      if (data.evidenceKind === "cash_ack" && !data.cashAckNote) {
        ctx.addIssue({
          code: "custom",
          message: "CASH_ACK_REQUIRED",
          path: ["cashAckNote"],
        });
      }
    }),
);

export type ConfirmSettlementRequestInput = z.infer<
  typeof confirmSettlementRequestSchema
>;

export const previewSettlementEffectRequestSchema = z
  .object({
    transfers: z
      .array(
        z
          .object({
            fromUserId: entityIdSchema,
            toUserId: entityIdSchema,
            amount: moneySchema,
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export type PreviewSettlementEffectRequestInput = z.infer<
  typeof previewSettlementEffectRequestSchema
>;

export const updateMemberDefaultSharesRequestSchema = z
  .object({
    defaultShares: z.number().int().positive().max(100),
  })
  .strict();

export type UpdateMemberDefaultSharesRequestInput = z.infer<
  typeof updateMemberDefaultSharesRequestSchema
>;

/** POST /workspaces/:id/balances/remind-debt — in-app reminder to a debtor. */
export const remindDebtRequestSchema = z
  .object({
    targetUserId: entityIdSchema,
  })
  .strict();

export type RemindDebtRequest = z.infer<typeof remindDebtRequestSchema>;

export type RemindDebtResponse = {
  ok: true;
  skipped?: "already_today" | "not_debtor";
};
