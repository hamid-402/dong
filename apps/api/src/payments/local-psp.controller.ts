import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { LocalPspIntentSummary, LocalPspVerifyResponse } from "@dang/contracts";
import { localPspVerifyRequestSchema } from "@dang/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PaymentsService } from "./payments.service.js";

/**
 * Public LocalPSP checkout API — intentId is the capability token
 * (same trust model as Zarinpal authority callback).
 */
@ApiTags("payments")
@Controller("payments/local")
export class LocalPspController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get("intents/:intentId")
  @ApiOperation({ summary: "Read LocalPSP intent (server-owned amount)" })
  @ApiOkResponse({ schema: { example: { intentId: "…", status: "pending" } } })
  getIntent(@Param("intentId") intentId: string): Promise<LocalPspIntentSummary> {
    return this.payments.getLocalPspIntent(intentId);
  }

  @Post("intents/:intentId/verify")
  @ApiOperation({
    summary: "Confirm LocalPSP payment (idempotent; ignores client amount)",
  })
  @ApiOkResponse({ schema: { example: { ok: true, status: "verified" } } })
  async verify(
    @Param("intentId") intentId: string,
    @Body(new ZodValidationPipe(localPspVerifyRequestSchema.default({})))
    _body: { amountMinor?: string },
  ): Promise<LocalPspVerifyResponse> {
    void _body; // amount is server-owned — never applied
    const result = await this.payments.verifyLocalPsp(intentId);
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
