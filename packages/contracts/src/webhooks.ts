import { createHmac, timingSafeEqual } from "node:crypto";

/** Outbound workspace webhook signing (G12 #58). */

export type WorkspaceWebhookSummary = {
  id: string;
  workspaceId: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  /** Secret is write-only — never returned after create. */
  hasSecret: boolean;
};

export type CreateWorkspaceWebhookRequest = {
  workspaceId: string;
  url: string;
  events: Array<"expense.posted" | "settlement.confirmed">;
  secret: string;
  idempotencyKey: string;
};

export type WorkspaceWebhookDeliveryResult = {
  ok: boolean;
  statusCode?: number;
  detail: string;
};

/** Persisted delivery row for UI / audit (R8). */
export type WorkspaceWebhookDeliverySummary = {
  id: string;
  workspaceId: string;
  webhookId: string;
  eventType: string;
  ok: boolean;
  statusCode?: number;
  detail: string;
  createdAt: string;
};

export function signWebhookBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
}): boolean {
  const expected = signWebhookBody(input.secret, input.timestamp, input.body);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
