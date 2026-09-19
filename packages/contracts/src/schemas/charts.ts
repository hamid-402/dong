import { z } from "zod";
import { isoDateSchema, yearMonthSchema } from "./money.js";

export const chartMonthsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional(),
});

export const chartRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const chartBudgetBurnQuerySchema = z.object({
  yearMonth: yearMonthSchema.optional(),
});

export type ChartMonthsQueryInput = z.infer<typeof chartMonthsQuerySchema>;
export type ChartRangeQueryInput = z.infer<typeof chartRangeQuerySchema>;
export type ChartBudgetBurnQueryInput = z.infer<typeof chartBudgetBurnQuerySchema>;

export const chartKindAggregateQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional(),
  kind: z.enum(["personal", "group", "building", "org"]).optional(),
});

export type ChartKindAggregateQueryInput = z.infer<typeof chartKindAggregateQuerySchema>;
