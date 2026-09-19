import { z } from "zod";

export const reportViewKindSchema = z.enum(["personal", "group", "building", "org"]);

export const reportViewMonthsSchema = z.union([
  z.literal(3),
  z.literal(6),
  z.literal(12),
]);

export const reportViewSortKeySchema = z.enum([
  "spend",
  "net",
  "settlements",
  "name",
  "share",
]);

export const createReportViewRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: reportViewKindSchema,
    months: reportViewMonthsSchema,
    sortKey: reportViewSortKeySchema,
  })
  .strict();

export type CreateReportViewRequestInput = z.infer<typeof createReportViewRequestSchema>;
