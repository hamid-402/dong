import { loadAppEnv } from "@dang/config";
import {
  buildLocalPspCheckoutUrl,
  signLocalPspIntent,
  verifyLocalPspIntentSignature,
  type CreatePaymentLinkRequest,
  type LocalPspIntentSummary,
  type LocalPspVerifyResponse,
  type PaymentLinkSummary,
} from "@dang/contracts";
import type { PaymentStore, PendingLocalPspPayment } from "./payment.store.js";

/**
 * In-repo PSP adapter (DEEP R10-21).
 * Primary payment path when Zarinpal is not live — no merchant key required.
 * Public checkout stays available; verify requires HMAC + payment-link ownership.
 */
export class LocalPspAdapter {
  constructor(private readonly store: PaymentStore) {}

  private signingSecret(): string {
    return loadAppEnv().sessionSecret;
  }

  signIntent(pending: {
    intentId: string;
    workspaceId: string;
    amountMinor: string;
    expiresAt: string;
  }): string {
    return signLocalPspIntent({
      secret: this.signingSecret(),
      intentId: pending.intentId,
      workspaceId: pending.workspaceId,
      amountMinor: pending.amountMinor,
      expiresAt: pending.expiresAt,
    });
  }

  checkSignature(
    pending: PendingLocalPspPayment,
    signature: string | undefined | null,
  ): boolean {
    const sig = signature?.trim() ?? "";
    if (!sig) return false;
    return verifyLocalPspIntentSignature({
      secret: this.signingSecret(),
      intentId: pending.intentId,
      workspaceId: pending.workspaceId,
      amountMinor: pending.amountMinor,
      expiresAt: pending.expiresAt,
      signature: sig,
    });
  }

  /**
   * Payment-link ownership: workspace, amount, provider, and providerRef must match.
   * Intents without a link (legacy/edge) pass ownership when signature is valid.
   */
  async assertLinkOwnership(pending: PendingLocalPspPayment): Promise<boolean> {
    if (!pending.paymentLinkId) return true;
    const link = await this.store.getLink(
      pending.workspaceId,
      pending.paymentLinkId,
    );
    if (!link) return false;
    if (link.workspaceId !== pending.workspaceId) return false;
    if (link.amount.amountMinor !== pending.amountMinor) return false;
    if (link.provider !== "local_psp") return false;
    if (link.providerRef !== pending.intentId) return false;
    return true;
  }

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
    const expiresAtIso = expiresAt.toISOString();
    const sig = this.signIntent({
      intentId,
      workspaceId: input.workspaceId,
      amountMinor: input.amount.amountMinor,
      expiresAt: expiresAtIso,
    });
    const checkoutUrl = buildLocalPspCheckoutUrl(intentId, env.webOrigin, {
      sig,
    });

    const link = await this.store.create("local_psp", input, {
      checkoutUrl,
      providerRef: intentId,
    });

    await this.store.savePendingLocalPsp({
      intentId,
      amountMinor: input.amount.amountMinor,
      currency: input.amount.currency,
      description: input.description.trim(),
      returnUrl: input.returnUrl.trim(),
      workspaceId: input.workspaceId,
      paymentLinkId: link.id,
      expiresAt: expiresAtIso,
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
   * Caller must already have validated HMAC + ownership.
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
