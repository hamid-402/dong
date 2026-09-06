import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreatePaymentLinkRequest,
  PaymentLinkSummary,
} from "@dang/contracts";
import { createPaymentLinkRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PaymentsService } from "./payments.service.js";

@ApiTags("payments")
@Controller("workspaces/:workspaceId/payment-links")
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Create PSP payment link (no card custody)",
  })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPaymentLinkRequestSchema)) body: CreatePaymentLinkRequest,
  ): Promise<PaymentLinkSummary> {
    return this.payments.createLink(actor, workspaceId, body);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<PaymentLinkSummary[]> {
    return this.payments.listLinks(actor, workspaceId);
  }
}
