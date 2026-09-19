import { loadAppEnv } from "@dang/config";
import {
  buildLocalPspCheckoutUrl,
  type CreatePaymentLinkRequest,
  type LocalPspIntentSummary,
  type LocalPspVerifyResponse,
  type PaymentLinkSummary,
} from "@dang/contracts";
import type { PaymentStore, PendingLocalPspPayment } from "./payment.store.js";

/**
 * In-repo PSP adapter (DEEP R10-21).
 * Primary payment path when Zarinpal is not live — no merchant key required.
 */
export class LocalPspAdapter {
  constructor(private readonly store: PaymentStore) {}

  /**
   * Create payment link + server-owned intent; checkoutUrl points at web LocalPSP page.
   */
  async createPaymentIntent(
    input: CreatePaymentLinkRequest,
  ): Promise<{ link: PaymentLinkSummary; intent: PendingLocalPspPayment }> {
    const intentId = crypto.randomUUID();
    const env = loadAppEnv();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    const checkoutUrl = buildLocalPspCheckoutUrl(intentId, env.webOrigin);

    const link = await this.store.create(
      "local_psp",
      input,
      { checkoutUrl, providerRef: intentId },
    );

    await this.store.savePendingLocalPsp({
      intentId,
      amountMinor: input.amount.amountMinor,
      currency: input.amount.currency,
      description: input.description.trim(),
      returnUrl: input.returnUrl.trim(),
      workspaceId: input.workspaceId,
      paymentLinkId: link.id,
      expiresAt: expiresAt.toISOString(),
    });

    const intent = await this.store.findPendingLocalPsp(intentId);
    if (!intent) throw new Error("LOCAL_PSP_INTENT_CREATE_FAILED");
    return { link, intent };
  }

  toPublicSummary(pending: PendingLocalPspPayment): LocalPspIntentSummary {
    const expired =
      pending.status === "pending" &&
      new Date(pending.expiresAt).getTime() < Date.now();
    return {
      intentId: pending.intentId,
      provider: "local_psp",
      amount: {
        amountMinor: pending.amountMinor,
        currency: (pending.currency as "IRR") || "IRR",
      },
      description: pending.description,
      status: expired ? "expired" : pending.status,
      returnUrl: pending.returnUrl,
      createdAt: pending.createdAt,
      expiresAt: pending.expiresAt,
      verifiedAt: pending.verifiedAt,
      refId: pending.refId,
    };
  }

  /**
   * Simulate user pay → verify. Amount is always read from the server-owned intent.
   * Idempotent: second verify returns the same verified intent.
   */
  async verify(intentId: string): Promise<{
    pending: PendingLocalPspPayment | null;
    response: LocalPspVerifyResponse;
  }> {
    const pending = await this.store.findPendingLocalPsp(intentId.trim());
    if (!pending) {
      return {
        pending: null,
        response: {
          ok: false,
          status: "unknown",
          intentId: intentId.trim(),
          amount: { amountMinor: "0", currency: "IRR" },
          returnUrl: "",
        },
      };
    }

    if (pending.status === "pending" && new Date(pending.expiresAt).getTime() < Date.now()) {
      return {
        pending,
        response: {
          ok: false,
          status: "expired",
          intentId: pending.intentId,
          amount: {
            amountMinor: pending.amountMinor,
            currency: (pending.currency as "IRR") || "IRR",
          },
          returnUrl: pending.returnUrl,
        },
      };
    }

    const refId = pending.refId ?? `local_${pending.intentId.slice(0, 12)}`;
    const verified =
      pending.status === "verified"
        ? pending
        : await this.store.markLocalPspVerified(pending.intentId, refId);

    return {
      pending: verified,
      response: {
        ok: true,
        status: "verified",
        intentId: verified.intentId,
        amount: {
          amountMinor: verified.amountMinor,
          currency: (verified.currency as "IRR") || "IRR",
        },
        refId: verified.refId,
        returnUrl: verified.returnUrl,
      },
    };
  }
}
