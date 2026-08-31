import type { Money } from "./money.js";

/**
 * Payment links only — Dang never stores card/PAN/CVV or holds customer funds.
 * External PSP redirects complete the payment; we only track link status.
 */
export type PaymentProviderId = "stub" | "zarinpal" | "idpay";

export type CreatePaymentLinkRequest = {
  workspaceId: string;
  settlementId?: string;
  amount: Money;
  description: string;
  /** Return URL after PSP redirect (must be https in production). */
  returnUrl: string;
  idempotencyKey: string;
};

export type PaymentLinkStatus =
  | "created"
  | "opened"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

export type PaymentLinkSummary = {
  id: string;
  workspaceId: string;
  settlementId?: string;
  provider: PaymentProviderId;
  amount: Money;
  description: string;
  /** External checkout URL — never a Dang-hosted card form. */
  checkoutUrl: string;
  status: PaymentLinkStatus;
  /** Provider reference only; no card material. */
  providerRef: string;
  createdAt: string;
  expiresAt: string;
};

/** Fields that must never appear on payment contracts or logs. */
export const forbiddenPaymentFields = [
  "cardNumber",
  "pan",
  "cvv",
  "cvc",
  "expiry",
  "cardHolder",
  "pin",
  "track2",
] as const;

export function assertNoCustodyPayload(body: object): void {
  for (const key of Object.keys(body)) {
    const normalized = key.toLowerCase().replaceAll(/[_-]/g, "");
    for (const forbidden of forbiddenPaymentFields) {
      if (normalized.includes(forbidden.toLowerCase())) {
        throw new Error("PAYMENT_CUSTODY_FORBIDDEN");
      }
    }
  }
}

export function buildStubCheckoutUrl(linkId: string, returnUrl: string): string {
  const u = new URL("https://pay.dang.local/stub/checkout");
  u.searchParams.set("linkId", linkId);
  u.searchParams.set("returnUrl", returnUrl);
  return u.toString();
}

export const paymentHardeningNotes = [
  "no_card_custody",
  "psp_redirect_only",
  "idempotent_link_create",
  "https_return_url_production",
] as const;
