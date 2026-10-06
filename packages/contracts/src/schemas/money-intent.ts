import { z } from "zod";
import { MONEY_INTENT_KINDS, MONEY_INTENT_PERIODS } from "../money-intent.js";
import { entityIdSchema, idempotencyKeySchema } from "./money.js";

const moneyIntentKindSchema = z.enum(MONEY_INTENT_KINDS);
const moneyIntentPeriodSchema = z.enum(MONEY_INTENT_PERIODS);

const positiveMinorSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((v) => BigInt(v) > 0n, { message: "target_RANGE" });

export const createMoneyIntentRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: moneyIntentKindSchema,
    period: moneyIntentPeriodSchema.optional(),
    targetMinor: positiveMinorSchema.optional(),
    targetPercent: z.number().int().min(1).max(100).optional(),
    goalId: entityIdSchema.optional(),
    active: z.boolean().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    const kind = val.kind;
    const needsAmount = [
      "spend_cap_amount",
      "debt_open_cap",
      "liquid_floor",
      "net_floor",
      "installment_pay_cap",
      "investment_floor",
    ].includes(kind);
    const needsPercent = [
      "save_income_percent",
      "spend_cap_income_percent",
      "savings_goal_link",
    ].includes(kind);
    const needsGoal = kind === "savings_goal_link";
    if (needsAmount && !val.targetMinor) {
      ctx.addIssue({ code: "custom", message: "INTENT_AMOUNT", path: ["targetMinor"] });
    }
    if (needsPercent && val.targetPercent == null) {
      ctx.addIssue({ code: "custom", message: "INTENT_PERCENT", path: ["targetPercent"] });
    }
    if (needsGoal && !val.goalId) {
      ctx.addIssue({ code: "custom", message: "INTENT_GOAL", path: ["goalId"] });
    }
  });

export type CreateMoneyIntentRequestInput = z.infer<typeof createMoneyIntentRequestSchema>;

export const updateMoneyIntentRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    period: moneyIntentPeriodSchema.optional(),
    targetMinor: positiveMinorSchema.nullable().optional(),
    targetPercent: z.number().int().min(1).max(100).nullable().optional(),
    goalId: entityIdSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type UpdateMoneyIntentRequestInput = z.infer<typeof updateMoneyIntentRequestSchema>;
