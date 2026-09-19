// Zod body-validation exempt: GET callback with server-side amount lookup. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, Query, Res } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { isZarinpalLive, loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import type { FastifyReply } from "fastify";
import { PAYMENT_STORE, type PaymentStore } from "./payment.store.js";
import { PaymentsService } from "./payments.service.js";
import { zarinpalVerifyPayment } from "./zarinpal.client.js";

const logger = createLogger("dang-api-zarinpal-callback");

function redirectOrJson(
  reply: FastifyReply,
  returnUrl: string | undefined,
  payload: { ok: boolean; status: string; refId?: string; detail?: string },
): void {
  if (returnUrl && /^https?:\/\//i.test(returnUrl)) {
    try {
      const target = new URL(returnUrl);
      target.searchParams.set("payment", payload.ok ? "ok" : "failed");
      target.searchParams.set("status", payload.status);
      if (payload.refId) target.searchParams.set("refId", payload.refId);
      if (payload.detail) target.searchParams.set("detail", payload.detail.slice(0, 200));
      void reply.redirect(target.toString(), 302);
      return;
    } catch {
      /* fall through to JSON */
    }
  }
  void reply.status(payload.ok ? 200 : 400).send(payload);
}

/**
 * Zarinpal return URL handler — active only when ZARINPAL_ENABLED=1.
 * Amount is taken from server-side pending mapping, never from query params.
 * When returnUrl was stored on create, browser is redirected; otherwise JSON.
 */
@ApiTags("payments")
@Controller("payments/zarinpal")
export class ZarinpalCallbackController {
  constructor(
    @Inject(PAYMENT_STORE) private readonly payments: PaymentStore,
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  @Get("callback")
  @ApiOperation({ summary: "Zarinpal payment callback (verify when live; redirect when returnUrl set)" })
  @ApiOkResponse({ schema: { example: { ok: true, status: "OK" } } })
  async callback(
    @Res({ passthrough: false }) reply: FastifyReply,
    @Query("Authority") authority?: string,
    @Query("Status") status?: string,
  ): Promise<void> {
    const env = loadAppEnv();
    if (!isZarinpalLive(env.zarinpalMerchantId)) {
      redirectOrJson(reply, undefined, {
        ok: false,
        status: "disabled",
        detail: "Set ZARINPAL_MERCHANT_ID and ZARINPAL_ENABLED=1 to activate",
      });
      return;
    }
    if (status !== "OK" || !authority?.trim()) {
      redirectOrJson(reply, undefined, { ok: false, status: status || "NOK" });
      return;
    }

    const pending = await this.payments.findPendingZarinpal(authority.trim());
    if (!pending) {
      logger.error("Zarinpal callback for unknown authority", {
        authority: authority.trim(),
      });
      redirectOrJson(reply, undefined, { ok: false, status: "unknown_authority" });
      return;
    }

    if (pending.status === "verified") {
      await this.paymentsService.completeZarinpalVerification(
        pending.authority,
        pending.refId ?? "",
      );
      redirectOrJson(reply, pending.returnUrl, {
        ok: true,
        status: "OK",
        refId: pending.refId,
      });
      return;
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
      redirectOrJson(reply, pending.returnUrl, {
        ok: true,
        status: "OK",
        refId: completed.refId,
      });
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error("Zarinpal verify failed", { detail });
      redirectOrJson(reply, pending.returnUrl, {
        ok: false,
        status: "verify_failed",
        detail,
      });
    }
  }
}
