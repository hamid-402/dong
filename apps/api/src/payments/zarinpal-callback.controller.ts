// Zod body-validation exempt: GET callback with server-side amount lookup. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { isZarinpalLive, loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { PAYMENT_STORE, type PaymentStore } from "./payment.store.js";
import { PaymentsService } from "./payments.service.js";
import { zarinpalVerifyPayment } from "./zarinpal.client.js";

const logger = createLogger("dang-api-zarinpal-callback");

/**
 * Zarinpal return URL handler — active only when ZARINPAL_ENABLED=1.
 * Amount is taken from server-side pending mapping, never from query params.
 */
@ApiTags("payments")
@Controller("payments/zarinpal")
export class ZarinpalCallbackController {
  constructor(
    @Inject(PAYMENT_STORE) private readonly payments: PaymentStore,
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  @Get("callback")
  @ApiOperation({ summary: "Zarinpal payment callback (verify when live)" })
  @ApiOkResponse({ schema: { example: { ok: true, status: "OK" } } })
  async callback(
    @Query("Authority") authority?: string,
    @Query("Status") status?: string,
  ): Promise<{ ok: boolean; status: string; refId?: string; detail?: string }> {
    const env = loadAppEnv();
    if (!isZarinpalLive(env.zarinpalMerchantId)) {
      return {
        ok: false,
        status: "disabled",
        detail: "Set ZARINPAL_MERCHANT_ID and ZARINPAL_ENABLED=1 to activate",
      };
    }
    if (status !== "OK" || !authority?.trim()) {
      return { ok: false, status: status || "NOK" };
    }

    const pending = await this.payments.findPendingZarinpal(authority.trim());
    if (!pending) {
      logger.error("Zarinpal callback for unknown authority", {
        authority: authority.trim(),
      });
      return { ok: false, status: "unknown_authority" };
    }

    if (pending.status === "verified") {
      // Re-run follow-on so a prior verify that failed mid-follow-on can heal.
      await this.paymentsService.completeZarinpalVerification(
        pending.authority,
        pending.refId ?? "",
      );
      return { ok: true, status: "OK", refId: pending.refId };
    }

    try {
      const verified = await zarinpalVerifyPayment({
        authority: pending.authority,
        amountMinor: pending.amountMinor,
      });
      const completed = await this.paymentsService.completeZarinpalVerification(
        pending.authority,
        verified.refId,
      );
      logger.info("Zarinpal verified", { refId: completed.refId });
      return { ok: true, status: "OK", refId: completed.refId };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error("Zarinpal verify failed", { detail });
      return { ok: false, status: "verify_failed", detail };
    }
  }
}
