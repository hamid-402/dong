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
  "analytics.etl",
  "analytics.threshold",
  "retention.purge",
  "billing.period.rollover",
  "billing.invoice.reconcile",
  "billing.period.finalize.reminder",
  "building.charge.generate",
  "invite.remind",
  "assets.depreciate.monthly",
]);

export const runJobRequestSchema = z
  .object({
    name: workerJobNameSchema,
  })
  .strict();

export type RunJobRequestInput = z.infer<typeof runJobRequestSchema>;
