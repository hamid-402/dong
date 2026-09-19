import type { Money } from "./money.js";

/**
 * Payment links only — Dang never stores card/PAN/CVV or holds customer funds.
 * PSP checkout redirects complete the payment; we only track link status.
 * `local_psp` is the in-repo primary path; `zarinpal` only when merchant is live.
 */
export type PaymentProviderId = "stub" | "local_psp" | "zarinpal" | "idpay";

export type CreatePaymentLinkRequest = {
  workspaceId: string;
  settlementId?: string;
  invoiceId?: string;
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
  invoiceId?: string;
  provider: PaymentProviderId;
  amount: Money;
  description: string;
  /** Checkout URL — LocalPSP page or external PSP; never a card form. */
  checkoutUrl: string;
  status: PaymentLinkStatus;
  /** Provider reference only; no card material. */
  providerRef: string;
  createdAt: string;
  expiresAt: string;
};

/** Public LocalPSP checkout intent (amount is server-owned). */
export type LocalPspIntentSummary = {
  intentId: string;
  provider: "local_psp";
  amount: Money;
  description: string;
  /** `expired` is derived at read time when pending past expiresAt. */
  status: "pending" | "verified" | "expired";
  returnUrl: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  refId?: string;
};

export type LocalPspVerifyResponse = {
  ok: boolean;
  status: "verified" | "pending" | "expired" | "unknown";
  intentId: string;
  /** Server-owned amount — never taken from the client body. */
  amount: Money;
  refId?: string;
  returnUrl: string;
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

/** Web checkout for LocalPSP (primary path when Zarinpal is not live). */
export function buildLocalPspCheckoutUrl(
  intentId: string,
  webOrigin = "http://localhost:3005",
): string {
  const base = webOrigin.replace(/\/$/, "");
  const u = new URL(`${base}/payments/local/checkout`);
  u.searchParams.set("intentId", intentId);
  return u.toString();
}

export const paymentHardeningNotes = [
  "no_card_custody",
  "psp_redirect_only",
  "idempotent_link_create",
  "https_return_url_production",
  "local_psp_primary",
  "amount_server_owned",
] as const;
