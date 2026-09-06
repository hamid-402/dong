import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CloseExpensePeriodRequest,
  CreateExpensePeriodRequest,
  DisputeInvoiceRequestInput,
  ExpensePeriodSummary,
  GeneratePeriodInvoicesRequest,
  MemberInvoiceSummary,
} from "@dang/contracts";
import {
  closeExpensePeriodRequestSchema,
  createExpensePeriodRequestSchema,
  disputeInvoiceRequestSchema,
  generatePeriodInvoicesRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BillingService } from "./billing.service.js";

@ApiTags("billing")
@Controller("workspaces/:workspaceId")
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Post("periods")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a day/week/month expense period" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  createPeriod(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createExpensePeriodRequestSchema))
    body: CreateExpensePeriodRequest,
  ): Promise<ExpensePeriodSummary> {
    return this.billing.createPeriod(actor, workspaceId, body);
  }

  @Get("periods")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List expense periods" })
  listPeriods(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<ExpensePeriodSummary[]> {
    return this.billing.listPeriods(actor, workspaceId);
  }

  @Post("periods/:periodId/invoices/generate")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Build member invoices from shared/private expenses in a period",
  })
  generateInvoices(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("periodId") periodId: string,
    @Body(new ZodValidationPipe(generatePeriodInvoicesRequestSchema))
    body: GeneratePeriodInvoicesRequest,
  ): Promise<MemberInvoiceSummary[]> {
    return this.billing.generateInvoices(actor, workspaceId, periodId, body ?? {});
  }

  @Get("periods/:periodId/invoices")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List member invoices for a period" })
  listInvoices(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("periodId") periodId: string,
  ): Promise<MemberInvoiceSummary[]> {
    return this.billing.listInvoices(actor, workspaceId, periodId);
  }

  @Post("invoices/:invoiceId/approve")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Member approves their invoice draft" })
  approve(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("invoiceId") invoiceId: string,
  ): Promise<MemberInvoiceSummary> {
    return this.billing.approveInvoice(actor, workspaceId, invoiceId);
  }

  @Post("invoices/:invoiceId/dispute")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Member disputes their invoice draft" })
  dispute(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("invoiceId") invoiceId: string,
    @Body(new ZodValidationPipe(disputeInvoiceRequestSchema))
    body: DisputeInvoiceRequestInput,
  ): Promise<MemberInvoiceSummary> {
    return this.billing.disputeInvoice(actor, workspaceId, invoiceId, body?.note);
  }

  @Post("invoices/:invoiceId/issue")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Issue an approved invoice for payment" })
  issue(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("invoiceId") invoiceId: string,
  ): Promise<MemberInvoiceSummary> {
    return this.billing.issueInvoice(actor, workspaceId, invoiceId);
  }

  @Post("invoices/:invoiceId/paid")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Mark an issued invoice as paid" })
  markPaid(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("invoiceId") invoiceId: string,
  ): Promise<MemberInvoiceSummary> {
    return this.billing.markInvoicePaid(actor, workspaceId, invoiceId);
  }

  @Post("periods/:periodId/close")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Close an expense period" })
  closePeriod(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("periodId") periodId: string,
    @Body(new ZodValidationPipe(closeExpensePeriodRequestSchema))
    body: CloseExpensePeriodRequest,
  ): Promise<ExpensePeriodSummary> {
    return this.billing.closePeriod(actor, workspaceId, periodId, body ?? {});
  }

  @Post("periods/:periodId/cancel")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Cancel an open expense period" })
  cancelPeriod(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("periodId") periodId: string,
  ): Promise<ExpensePeriodSummary> {
    return this.billing.cancelPeriod(actor, workspaceId, periodId);
  }
}
