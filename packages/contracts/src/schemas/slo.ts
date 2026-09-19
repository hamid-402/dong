import { z } from "zod";

/** Runtime contract for GET /api/v1/platform/slo (R10-10 / D3 depth). */
export const sloSignalIdSchema = z.enum([
  "outbox_relay",
  "jobs_dlq",
  "security_error_rate",
]);

export const sloWindowIdSchema = z.enum(["5m", "1h", "24h"]);

export const sloSignalSnapshotSchema = z
  .object({
    id: sloSignalIdSchema,
    available: z.boolean(),
    unavailableReason: z.string().optional(),
    observed: z.record(z.string(), z.number().nullable()),
    burnRate: z.number().nullable(),
    threshold: z.number(),
    breached: z.boolean(),
  })
  .strict();

export const sloWindowSnapshotSchema = z
  .object({
    id: sloWindowIdSchema,
    durationMs: z.number().int().positive(),
    signals: z.array(sloSignalSnapshotSchema),
    breached: z.boolean(),
  })
  .strict();

export const platformSloResponseSchema = z
  .object({
    provider: z.literal("in_app_v1"),
    generatedAt: z.string().min(1),
    windows: z.array(sloWindowSnapshotSchema).min(1),
    breached: z.boolean(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

export type PlatformSloResponseInput = z.infer<typeof platformSloResponseSchema>;
