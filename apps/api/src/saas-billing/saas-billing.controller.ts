// Zod: POST bodies validated via ZodValidationPipe.
import { Body, Controller, Inject, Param, Post, Get, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateSubscriptionInvoiceRequest,
  PaySubscriptionInvoiceRequest,
  PaymentLinkSummary,
  SaasUsageSnapshot,
  SubscriptionInvoiceSummary,
} from "@dang/contracts";
import {
  createSubscriptionInvoiceSchema,
  paySubscriptionInvoiceSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SaasBillingService } from "./saas-billing.service.js";

@ApiTags("saas-billing")
@Controller("workspaces/:workspaceId/saas")
export class SaasBillingController {
  constructor(
    @Inject(SaasBillingService) private readonly saas: SaasBillingService,
  ) {}

  @Get("usage")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Real usage meter for current UTC month (R10-21)" })
  usage(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<SaasUsageSnapshot> {
    return this.saas.usage(actor, workspaceId);
  }

  @Get("invoices")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List platform subscription invoices" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<SubscriptionInvoiceSummary[]> {
    return this.saas.listInvoices(actor, workspaceId);
  }

  @Post("invoices")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Issue subscription invoice from plan catalog price" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createSubscriptionInvoiceSchema))
    body: CreateSubscriptionInvoiceRequest,
  ): Promise<SubscriptionInvoiceSummary> {
    return this.saas.createInvoice(actor, workspaceId, body);
  }

  @Post("invoices/:invoiceId/pay")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Start LocalPSP or Zarinpal checkout for subscription invoice",
  })
  pay(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("invoiceId") invoiceId: string,
    @Body(new ZodValidationPipe(paySubscriptionInvoiceSchema))
    body: PaySubscriptionInvoiceRequest,
  ): Promise<{ invoice: SubscriptionInvoiceSummary; paymentLink: PaymentLinkSummary }> {
    return this.saas.payInvoice(actor, workspaceId, invoiceId, body);
  }
}
