import { z } from "zod";

export const workerJobNameSchema = z.enum([
  "ocr.receipt",
  "quarantine.scan",
  "notify.email",
  "notify.push",
  "report.export",
  "webhook.dispatch",
  "ledger.rebuild_balances",
  "recurrence.tick",
  "digest.weekly",
]);

export const runJobRequestSchema = z
  .object({
    name: workerJobNameSchema,
  })
  .strict();

export type RunJobRequestInput = z.infer<typeof runJobRequestSchema>;
