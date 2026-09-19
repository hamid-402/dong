import { z } from "zod";

/** Runtime contract for GET /api/v1/health/ready (R10-10). */
export const healthReadyResponseSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  service: z.string().optional(),
  version: z.string().optional(),
  checks: z
    .object({
      iam: z.string(),
      requirePostgres: z.boolean().optional(),
      databaseConfigured: z.boolean().optional(),
      database: z.string().optional(),
      redisConfigured: z.boolean().optional(),
      redis: z.string().optional(),
    })
    .passthrough(),
}).passthrough();

/** RFC 7807-ish problem body used by Nest filters (R10-10 / D3). */
export const problemDetailsSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

/** Runtime contract for GET /api/v1/system/capabilities — core fields web relies on. */
export const systemCapabilitiesSchema = z.object({
  version: z.string(),
  allowDevAuth: z.boolean(),
  demoSeedAllowed: z.boolean().optional(),
  readiness: z.enum(["ready", "degraded"]).optional(),
  persistence: z.record(z.string(), z.string()).optional(),
  providers: z
    .object({
      payment: z.enum(["stub", "local_psp", "zarinpal", "idpay"]).optional(),
      paymentOnBehalf: z.enum(["none", "on_behalf_v1"]).optional(),
      slo: z.enum(["none", "in_app_v1"]).optional(),
      jobs: z.string().optional(),
      tracing: z.string().optional(),
      outbox: z.string().optional(),
      auditIntegrity: z.string().optional(),
      accessPolicy: z.string().optional(),
      secrets: z.string().optional(),
      masterKeySource: z
        .enum(["env", "http_vault", "none", "plaintext"])
        .optional(),
      antifraud: z.string().optional(),
      makerChecker: z.string().optional(),
      makerCheckerSla: z.enum(["off", "hours_v1"]).optional(),
      ledgerRebuild: z.enum(["ack_v1"]).optional(),
      billingAutomation: z
        .enum(["live_invoice_sweep_v1", "live_invoice_v1"])
        .optional(),
      invoiceReconcile: z
        .enum(["off", "expense_invoice_v1", "expense_ledger_invoice_v1"])
        .optional(),
      fx: z.enum(["stub", "table"]).optional(),
      displayUnit: z.enum(["rial", "toman"]).optional(),
      retention: z.enum(["none", "purge_v1", "dry_run_purge_v1"]).optional(),
      fxProvider: z.enum(["none", "http_v1"]).optional(),
      fxPreview: z.enum(["none", "preview_v1"]).optional(),
      outboundWebhooks: z.enum(["none", "hmac_v1"]).optional(),
      notificationEventPrefs: z.enum(["none", "in_app_v1"]).optional(),
    })
    .passthrough()
    .optional(),
  stubs: z.record(z.string(), z.boolean()).optional(),
  conversionLive: z.boolean().optional(),
}).passthrough();
