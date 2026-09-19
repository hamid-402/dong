/**
 * Platform SaaS billing (R10-21) — distinct from group member invoices.
 * Payable when LocalPSP or live Zarinpal; metering always from real stores.
 */

import { z } from "zod";
import type { Money } from "./money.js";
import type { WorkspacePlanName } from "./wave-f.js";
import { idempotencyKeySchema } from "./schemas/money.js";

/** Catalog prices in IRR minor (product config — not invented usage). */
export const SAAS_PLAN_PRICE_IRR_MINOR: Record<WorkspacePlanName, string> = {
  free: "0",
  pro: "4900000",
  business: "14900000",
};

export type SaasUsageSnapshot = {
  workspaceId: string;
  /** Calendar month YYYY-MM (UTC). */
  periodMonth: string;
  seatsUsed: number;
  seatsLimit: number | null;
  postedExpensesInPeriod: number;
  measuredAt: string;
  sources: {
    seats: "iam.members";
    expenses: "expense.posted";
    plan: "workspace_plan";
  };
  currentPlan: WorkspacePlanName;
};

export type SubscriptionInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "cancelled";

export type SubscriptionInvoiceSummary = {
  id: string;
  workspaceId: string;
  periodMonth: string;
  targetPlan: WorkspacePlanName;
  amount: Money;
  status: SubscriptionInvoiceStatus;
  /** True when providers.payment is local_psp or zarinpal at issue/read time. */
  payable: boolean;
  paymentLinkId?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  note: string;
};

export const createSubscriptionInvoiceSchema = z
  .object({
    targetPlan: z.enum(["pro", "business"]),
    periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type CreateSubscriptionInvoiceRequest = z.infer<
  typeof createSubscriptionInvoiceSchema
>;

export const paySubscriptionInvoiceSchema = z
  .object({
    returnUrl: z.string().trim().url().max(2048),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type PaySubscriptionInvoiceRequest = z.infer<
  typeof paySubscriptionInvoiceSchema
>;

export function saasPlanPrice(plan: WorkspacePlanName): Money {
  return {
    amountMinor: SAAS_PLAN_PRICE_IRR_MINOR[plan],
    currency: "IRR",
  };
}

export function currentUtcPeriodMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}
