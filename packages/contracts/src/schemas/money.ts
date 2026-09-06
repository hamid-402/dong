import { z } from "zod";

/** Soft ceiling to reject overflow / abuse payloads (IRR minor units). */
export const MAX_AMOUNT_MINOR = 10n ** 15n;

/**
 * Canonical Money shape used at API boundaries.
 * amountMinor must be a positive decimal-digit string (no sign, no leading zeros required).
 */
export const moneySchema = z
  .object({
    amountMinor: z
      .string()
      .regex(/^\d+$/, "amount_FORMAT")
      .refine(
        (v) => {
          if (!/^\d+$/.test(v)) return false;
          const n = BigInt(v);
          return n > 0n && n < MAX_AMOUNT_MINOR;
        },
        { message: "amount_RANGE" },
      ),
    currency: z.literal("IRR"),
  })
  .strict();

export type MoneyInput = z.infer<typeof moneySchema>;

/** Opening balances and similar — zero allowed, still non-negative IRR minor. */
export const nonNegativeMoneySchema = z
  .object({
    amountMinor: z
      .string()
      .regex(/^\d+$/, "amount_FORMAT")
      .refine(
        (v) => {
          if (!/^\d+$/.test(v)) return false;
          const n = BigInt(v);
          return n >= 0n && n < MAX_AMOUNT_MINOR;
        },
        { message: "amount_RANGE" },
      ),
    currency: z.literal("IRR"),
  })
  .strict();

export type NonNegativeMoneyInput = z.infer<typeof nonNegativeMoneySchema>;

/** Non-empty opaque id (UUIDs in prod; short labels allowed in tests/dev). */
export const entityIdSchema = z.string().trim().min(1).max(128);

export const uuidSchema = z.string().uuid();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date_FORMAT");

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "yearMonth_FORMAT");

export const idempotencyKeySchema = z.string().trim().min(1).max(128);