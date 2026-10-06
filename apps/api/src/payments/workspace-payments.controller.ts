import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateCreditPurchasePaymentRequest,
  CreateCreditPurchaseRequest,
  CreateOnBehalfPaymentRequest,
  CreatePaymentReceiptRequest,
  CreatePettyCashFundRequest,
  CreatePettyCashMovementRequest,
  CreditPurchaseStatus,
  GiftPettyCashRequest,
  OnBehalfPaymentStatus,
  PaymentReceiptStatus,
  RejectOnBehalfPaymentRequest,
  RejectPaymentReceiptRequest,
  SettlePayRequest,
  SpendPettyCashAsExpenseRequest,
  TopupPettyCashFromMembersRequest,
} from "@dang/contracts";
import {
  createCreditPurchasePaymentRequestSchema,
  createCreditPurchaseRequestSchema,
  createOnBehalfPaymentRequestSchema,
  createPaymentReceiptRequestSchema,
  createPettyCashFundRequestSchema,
  createPettyCashMovementRequestSchema,
  giftPettyCashRequestSchema,
  rejectOnBehalfPaymentRequestSchema,
  rejectPaymentReceiptRequestSchema,
  settlePayRequestSchema,
  spendPettyCashAsExpenseRequestSchema,
  topupPettyCashFromMembersRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { WorkspacePaymentsService } from "./workspace-payments.service.js";

@ApiTags("workspace-payments")
@Controller("workspaces/:workspaceId/payments")
export class WorkspacePaymentsController {
  constructor(
    @Inject(WorkspacePaymentsService)
    private readonly payments: WorkspacePaymentsService,
  ) {}

  @Get("receipts")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List payment receipts (S11-09)" })
  listReceipts(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("status") status?: PaymentReceiptStatus,
  ) {
    return this.payments.listReceipts(actor, workspaceId, status);
  }

  @Post("receipts")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Submit payment receipt (no journal until approve)" })
  createReceipt(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPaymentReceiptRequestSchema))
    body: CreatePaymentReceiptRequest,
  ) {
    return this.payments.createReceipt(actor, workspaceId, body);
  }

  @Post("receipts/:rid/approve")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Approve receipt — posts double-entry journal" })
  approveReceipt(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("rid") rid: string,
  ) {
    return this.payments.approveReceipt(actor, workspaceId, rid);
  }

  @Post("receipts/:rid/reject")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Reject payment receipt" })
  rejectReceipt(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("rid") rid: string,
    @Body(new ZodValidationPipe(rejectPaymentReceiptRequestSchema))
    body: RejectPaymentReceiptRequest,
  ) {
    return this.payments.rejectReceipt(actor, workspaceId, rid, body);
  }

  @Get("petty-cash")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List petty cash funds with computed balances" })
  listPettyCash(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.payments.listPettyCash(actor, workspaceId);
  }

  @Get("petty-cash/health")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Petty cash health report from live fund balances and movements",
  })
  pettyCashHealth(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.payments.pettyCashHealth(actor, workspaceId);
  }

  @Get("petty-cash/:fid/ledger")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Petty-cash ledger: dates, topup/spend, running balance, who deposited and each member share",
  })
  getPettyCashLedger(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
  ) {
    return this.payments.getPettyCashLedger(actor, workspaceId, fid);
  }

  @Post("petty-cash")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create petty cash fund" })
  createPettyCash(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPettyCashFundRequestSchema))
    body: CreatePettyCashFundRequest,
  ) {
    return this.payments.createPettyCashFund(actor, workspaceId, body);
  }

  @Post("petty-cash/ensure-default")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Ensure default active petty-cash fund exists (finance only; idempotent; forbidden on personal)",
  })
  ensureDefaultPettyCash(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { idempotencyKey?: string },
  ) {
    return this.payments.ensureDefaultPettyCashFund(actor, workspaceId, body);
  }

  @Post("petty-cash/:fid/close")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Soft-close petty cash fund (finance only) — ledger kept; no further movements",
  })
  closePettyCash(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
  ) {
    return this.payments.closePettyCashFund(actor, workspaceId, fid);
  }

  @Post("petty-cash/:fid/reopen")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Reopen a soft-closed petty cash fund (finance only)",
  })
  reopenPettyCash(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
  ) {
    return this.payments.reopenPettyCashFund(actor, workspaceId, fid);
  }

  @Post("petty-cash/:fid/movements")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Record petty cash movement (spend cannot go negative)" })
  createMovement(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
    @Body(new ZodValidationPipe(createPettyCashMovementRequestSchema))
    body: CreatePettyCashMovementRequest,
  ) {
    return this.payments.createPettyCashMovement(actor, workspaceId, fid, body);
  }

  @Post("petty-cash/:fid/topup-from-members")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Charge petty cash from member shares — posts shared expense + topup movement",
  })
  topupFromMembers(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
    @Body(new ZodValidationPipe(topupPettyCashFromMembersRequestSchema))
    body: TopupPettyCashFromMembersRequest,
  ) {
    return this.payments.topupPettyCashFromMembers(actor, workspaceId, fid, body);
  }

  @Post("petty-cash/:fid/gift")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Gift to petty cash — increases fund only; no shared expense / no debts for others",
  })
  giftPettyCash(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
    @Body(new ZodValidationPipe(giftPettyCashRequestSchema))
    body: GiftPettyCashRequest,
  ) {
    return this.payments.giftPettyCash(actor, workspaceId, fid, body);
  }

  @Post("settle-pay")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Smart settle-pay: settlement claim ± fund gift by intent (previewOnly supported)",
  })
  settlePay(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(settlePayRequestSchema))
    body: SettlePayRequest,
  ) {
    return this.payments.settlePay(actor, workspaceId, body);
  }

  @Post("petty-cash/:fid/spend-as-expense")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Spend from petty cash as shared expense — posts expense + spend movement",
  })
  spendAsExpense(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("fid") fid: string,
    @Body(new ZodValidationPipe(spendPettyCashAsExpenseRequestSchema))
    body: SpendPettyCashAsExpenseRequest,
  ) {
    return this.payments.spendPettyCashAsExpense(actor, workspaceId, fid, body);
  }

  @Get("credit-purchases")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List credit purchases (group debt until paid)" })
  listCredit(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("status") status?: CreditPurchaseStatus,
  ) {
    return this.payments.listCreditPurchases(actor, workspaceId, status);
  }

  @Post("credit-purchases")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create credit purchase (open group debt)" })
  createCredit(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCreditPurchaseRequestSchema))
    body: CreateCreditPurchaseRequest,
  ) {
    return this.payments.createCreditPurchase(actor, workspaceId, body);
  }

  @Post("credit-purchases/:cid/payments")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Record payment against credit purchase" })
  payCredit(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("cid") cid: string,
    @Body(new ZodValidationPipe(createCreditPurchasePaymentRequestSchema))
    body: CreateCreditPurchasePaymentRequest,
  ) {
    return this.payments.createCreditPurchasePayment(
      actor,
      workspaceId,
      cid,
      body,
    );
  }

  @Get("on-behalf")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List on-behalf payments (S11-09 depth)" })
  listOnBehalf(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("status") status?: OnBehalfPaymentStatus,
  ) {
    return this.payments.listOnBehalf(actor, workspaceId, status);
  }

  @Post("on-behalf")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Initiate payment settling another member's debt (pending until approve)",
  })
  createOnBehalf(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createOnBehalfPaymentRequestSchema))
    body: CreateOnBehalfPaymentRequest,
  ) {
    return this.payments.createOnBehalf(actor, workspaceId, body);
  }

  @Post("on-behalf/:oid/approve")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Approve on-behalf — finance or payer; posts double-entry journal",
  })
  approveOnBehalf(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("oid") oid: string,
  ) {
    return this.payments.approveOnBehalf(actor, workspaceId, oid);
  }

  @Post("on-behalf/:oid/reject")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Reject on-behalf payment (no journal)" })
  rejectOnBehalf(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("oid") oid: string,
    @Body(new ZodValidationPipe(rejectOnBehalfPaymentRequestSchema))
    body: RejectOnBehalfPaymentRequest,
  ) {
    return this.payments.rejectOnBehalf(actor, workspaceId, oid, body);
  }
}
