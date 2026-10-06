import { z } from "zod";
import { entityIdSchema, idempotencyKeySchema, isoDateSchema, moneySchema } from "./money.js";

const catalogLineFieldsSchema = {
  catalogItemId: entityIdSchema.optional(),
  unitCode: z.string().trim().min(1).max(32).optional(),
  quantity: z.number().positive().max(1_000_000).optional(),
  unitPriceMinor: z.string().regex(/^\d+$/).optional(),
};

function refineAmountMatchesQuantity(
  data: {
    amount: { amountMinor: string };
    quantity?: number;
    unitPriceMinor?: string;
  },
  ctx: z.RefinementCtx,
  amountPath: PropertyKey[] = ["amount"],
): void {
  if (data.quantity === undefined || data.unitPriceMinor === undefined) return;
  const expected = BigInt(Math.round(data.quantity * Number(data.unitPriceMinor)));
  let actual: bigint;
  try {
    actual = BigInt(data.amount.amountMinor);
  } catch {
    ctx.addIssue({ code: "custom", message: "AMOUNT_MISMATCH", path: amountPath });
    return;
  }
  if (actual !== expected) {
    ctx.addIssue({ code: "custom", message: "AMOUNT_MISMATCH", path: amountPath });
  }
}

export const upsertWorkspaceDayRequestSchema = z
  .object({
    isHoliday: z.boolean().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type UpsertWorkspaceDayRequestInput = z.infer<
  typeof upsertWorkspaceDayRequestSchema
>;

export const createWorkspaceRangeLockRequestSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    reason: z.string().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateWorkspaceRangeLockRequestInput = z.infer<
  typeof createWorkspaceRangeLockRequestSchema
>;

const fundingFieldsSchema = {
  fundingSourceKind: z.enum(["personal", "petty_cash"]).optional(),
  fundingRefId: entityIdSchema.optional(),
};

function refineFundingSource(
  data: {
    fundingSourceKind?: "personal" | "petty_cash";
    fundingRefId?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.fundingSourceKind === "petty_cash" && !data.fundingRefId) {
    ctx.addIssue({
      code: "custom",
      message: "FUNDING_REF_REQUIRED",
      path: ["fundingRefId"],
    });
  }
  if (data.fundingRefId && !data.fundingSourceKind) {
    ctx.addIssue({
      code: "custom",
      message: "FUNDING_KIND_REQUIRED",
      path: ["fundingSourceKind"],
    });
  }
}

export const createDailyLedgerEntryRequestSchema = z
  .object({
    date: isoDateSchema,
    itemName: z.string().trim().min(1).max(200),
    amount: moneySchema,
    memberUserId: entityIdSchema.nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
    ...catalogLineFieldsSchema,
    ...fundingFieldsSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    refineAmountMatchesQuantity(data, ctx);
    refineFundingSource(data, ctx);
  });

export type CreateDailyLedgerEntryRequestInput = z.infer<
  typeof createDailyLedgerEntryRequestSchema
>;

export const createDailyLedgerDepositRequestSchema = z
  .object({
    date: isoDateSchema,
    amountMinor: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "AMOUNT_POSITIVE"),
    fundId: entityIdSchema,
    cashInByUserId: entityIdSchema.optional(),
    /**
     * balance (default): credit depositor via shared topup expense.
     * gift: fund-only donation with no member net change.
     */
    mode: z.enum(["balance", "gift"]).optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateDailyLedgerDepositRequestInput = z.infer<
  typeof createDailyLedgerDepositRequestSchema
>;

export const updateDailyLedgerEntryRequestSchema = z
  .object({
    itemName: z.string().trim().min(1).max(200),
    amount: moneySchema,
    idempotencyKey: idempotencyKeySchema,
    date: isoDateSchema.optional(),
    memberUserId: entityIdSchema.nullable().optional(),
    ...catalogLineFieldsSchema,
    ...fundingFieldsSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    refineAmountMatchesQuantity(data, ctx);
    refineFundingSource(data, ctx);
  });

export type UpdateDailyLedgerEntryRequestInput = z.infer<
  typeof updateDailyLedgerEntryRequestSchema
>;

export const ledgerDayLineSchema = z
  .object({
    itemName: z.string().trim().min(1).max(200),
    amount: moneySchema,
    memberUserId: entityIdSchema.nullable().optional(),
    ...catalogLineFieldsSchema,
    ...fundingFieldsSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    refineAmountMatchesQuantity(data, ctx);
    refineFundingSource(data, ctx);
  });

export const postLedgerDayRequestSchema = z
  .object({
    date: isoDateSchema,
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(ledgerDayLineSchema).min(1).max(200),
  })
  .strict();

export type PostLedgerDayRequestInput = z.infer<typeof postLedgerDayRequestSchema>;

export type ImportDailyLedgerPreviewRow = {
  date: string;
  column: string;
  itemName: string;
  amountToman: number;
  resolved: "shared" | "member" | "skip" | "unmapped";
  memberUserId?: string;
};

export const importDailyLedgerCsvRequestSchema = z
  .object({
    /** Long CSV or paste text (auto-detect Dong-To wide / long format). */
    csv: z.string().min(1).max(2_000_000).optional(),
    /** Same as csv — Excel clipboard paste (TSV/CSV). */
    paste: z.string().min(1).max(2_000_000).optional(),
    /** Base64 of a .xlsx workbook (جدول عمومی preferred). */
    xlsxBase64: z.string().min(1).max(8_000_000).optional(),
    /**
     * Edited preview rows (commit path after client-side cell edits).
     * When present, overrides csv/paste/xlsx parse as the source of truth.
     */
    rows: z
      .array(
        z
          .object({
            date: isoDateSchema,
            column: z.string().trim().min(1).max(120),
            itemName: z.string().trim().min(1).max(200),
            amountToman: z.number().int().positive().max(1_000_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .optional(),
    /** Holiday ISO dates from preview (optional companion to rows). */
    holidays: z.array(isoDateSchema).max(200).optional(),
    /**
     * Map Excel column labels → member userId | "shared" | "skip".
     * Required when auto-match cannot resolve a column (abort-all until mapped).
     */
    columnMap: z
      .record(z.string().min(1).max(120), z.string().min(1).max(80))
      .refine((m) => Object.keys(m).length <= 40, { message: "columnMap max 40 keys" })
      .optional(),
    /** auto: master if present else member sheets; master|members force source. */
    sheetSource: z.enum(["auto", "master", "members"]).optional(),
    /** Parse + resolve only — no expense writes. */
    previewOnly: z.boolean().optional(),
    idempotencyKey: idempotencyKeySchema.optional(),
  })
  .strict()
  .refine(
    (b) =>
      Boolean(
        b.csv?.trim() ||
          b.paste?.trim() ||
          b.xlsxBase64?.trim() ||
          (b.rows && b.rows.length > 0),
      ),
    { message: "csv, paste, xlsxBase64, or rows required" },
  );
export type ImportDailyLedgerCsvRequestInput = z.infer<
  typeof importDailyLedgerCsvRequestSchema
>;
