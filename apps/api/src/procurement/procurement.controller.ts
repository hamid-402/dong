import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  BudgetSummary,
  CreateBudgetRequest,
  CreateNeedRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseRequestRequest,
  CreateVendorRequest,
  DeliverySummary,
  NeedSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  RecordDeliveryRequest,
  SubmitApprovalRequest,
  VendorSummary,
} from "@dang/contracts";
import {
  createBudgetRequestSchema,
  createNeedRequestSchema,
  createPurchaseOrderRequestSchema,
  createPurchaseRequestRequestSchema,
  createVendorRequestSchema,
  recordDeliveryRequestSchema,
  submitApprovalRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ProcurementService } from "./procurement.service.js";

@ApiTags("procurement")
@Controller("workspaces/:workspaceId")
export class ProcurementController {
  constructor(@Inject(ProcurementService) private readonly procurement: ProcurementService) {}

  @Post("needs")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a need (Phase 3)" })
  createNeed(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createNeedRequestSchema)) body: CreateNeedRequest,
  ): Promise<NeedSummary> {
    return this.procurement.createNeed(actor, workspaceId, body);
  }

  @Get("needs")
  @UseGuards(AuthGuard)
  listNeeds(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<NeedSummary[]> {
    return this.procurement.listNeeds(actor, workspaceId);
  }

  @Post("purchase-requests")
  @UseGuards(AuthGuard)
  createPurchaseRequest(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPurchaseRequestRequestSchema))
    body: CreatePurchaseRequestRequest,
  ): Promise<PurchaseRequestSummary> {
    return this.procurement.createPurchaseRequest(actor, workspaceId, body);
  }

  @Post("purchase-requests/:requestId/submit")
  @UseGuards(AuthGuard)
  submitPurchaseRequest(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("requestId") requestId: string,
  ): Promise<PurchaseRequestSummary> {
    return this.procurement.submitPurchaseRequest(actor, workspaceId, requestId);
  }

  @Get("purchase-requests")
  @UseGuards(AuthGuard)
  listPurchaseRequests(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<PurchaseRequestSummary[]> {
    return this.procurement.listPurchaseRequests(actor, workspaceId);
  }

  @Post("approvals")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Approve or reject a submitted purchase request" })
  decide(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(submitApprovalRequestSchema)) body: SubmitApprovalRequest,
  ): Promise<PurchaseRequestSummary> {
    return this.procurement.decidePurchaseRequest(actor, workspaceId, body);
  }

  @Post("budgets")
  @UseGuards(AuthGuard)
  createBudget(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createBudgetRequestSchema)) body: CreateBudgetRequest,
  ): Promise<BudgetSummary> {
    return this.procurement.createBudget(actor, workspaceId, body);
  }

  @Get("budgets")
  @UseGuards(AuthGuard)
  listBudgets(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<BudgetSummary[]> {
    return this.procurement.listBudgets(actor, workspaceId);
  }

  @Post("vendors")
  @UseGuards(AuthGuard)
  createVendor(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createVendorRequestSchema)) body: CreateVendorRequest,
  ): Promise<VendorSummary> {
    return this.procurement.createVendor(actor, workspaceId, body);
  }

  @Get("vendors")
  @UseGuards(AuthGuard)
  listVendors(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<VendorSummary[]> {
    return this.procurement.listVendors(actor, workspaceId);
  }

  @Post("purchase-orders")
  @UseGuards(AuthGuard)
  createPurchaseOrder(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPurchaseOrderRequestSchema))
    body: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderSummary> {
    return this.procurement.createPurchaseOrder(actor, workspaceId, body);
  }

  @Get("purchase-orders")
  @UseGuards(AuthGuard)
  listPurchaseOrders(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<PurchaseOrderSummary[]> {
    return this.procurement.listPurchaseOrders(actor, workspaceId);
  }

  @Post("deliveries")
  @UseGuards(AuthGuard)
  recordDelivery(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(recordDeliveryRequestSchema)) body: RecordDeliveryRequest,
  ): Promise<DeliverySummary> {
    return this.procurement.recordDelivery(actor, workspaceId, body);
  }

  @Get("deliveries")
  @UseGuards(AuthGuard)
  listDeliveries(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<DeliverySummary[]> {
    return this.procurement.listDeliveries(actor, workspaceId);
  }
}
