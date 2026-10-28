import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { LocalPspIntentSummary, LocalPspVerifyResponse } from "@dang/contracts";
import { localPspVerifyRequestSchema } from "@dang/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PaymentsService } from "./payments.service.js";

/**
 * Public LocalPSP checkout API — intentId + HMAC sig are the capability token
 * (same trust model as Zarinpal authority callback, with explicit signature).
 * Route stays public for all environments (primary path when Zarinpal is not live).
 * POST verify is CSRF-exempt only when HMAC is valid (see CsrfGuard); invalid
 * HMAC falls through to double-submit CSRF (401/403 with a session cookie).
 */
@ApiTags("payments")
@Controller("payments/local")
export class LocalPspController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get("intents/:intentId")
  @ApiOperation({ summary: "Read LocalPSP intent (server-owned amount; requires sig)" })
  @ApiOkResponse({ schema: { example: { intentId: "…", status: "pending" } } })
  getIntent(
    @Param("intentId") intentId: string,
    @Query("sig") sig?: string,
  ): Promise<LocalPspIntentSummary> {
    return this.payments.getLocalPspIntent(intentId, sig);
  }

  @Post("intents/:intentId/verify")
  @ApiOperation({
    summary: "Confirm LocalPSP payment (HMAC + ownership; idempotent; ignores client amount)",
  })
  @ApiOkResponse({ schema: { example: { ok: true, status: "verified" } } })
  async verify(
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(localPspVerifyRequestSchema))
    body: { sig: string; amountMinor?: string },
  ): Promise<LocalPspVerifyResponse> {
    void body.amountMinor; // amount is server-owned — never applied
    const result = await this.payments.verifyLocalPsp(intentId, body.sig);
    if (result.status === "unknown") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "LocalPSP intent not found",
        status: 404,
      });
    }
    return result;
  }
}
