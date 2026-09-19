import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import type {
  AuthActor,
  BudgetSummary,
  CreateBudgetRequest,
  CreateNeedRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseRequestRequest,
  CreateVendorRequest,
  DeliverySummary,
  LinkPurchaseOrderExpenseRequest,
  Money,
  NeedSummary,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  RecordDeliveryRequest,
  SubmitApprovalRequest,
  VendorSummary,
} from "@dang/contracts";
import { isReadOnlyRole, PROCUREMENT_APPROVER_ROLES, PROCUREMENT_BUYER_ROLES, roleInSet } from "@dang/contracts";
import { CATALOG_STORE, type CatalogStore } from "../catalog/catalog.types.js";
import { ExpensesService } from "../expenses/expenses.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { PARTNERSHIP_STORE, type PartnershipStore } from "../partnership/partnership.types.js";
import {
  PROCUREMENT_STORE,
  type FrozenPurchaseOrderPricing,
  type ProcurementStore,
} from "./procurement.types.js";

@Injectable()
export class ProcurementService {
  constructor(
    @Inject(PROCUREMENT_STORE) private readonly store: ProcurementStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(CATALOG_STORE) private readonly catalog: CatalogStore,
    @Inject(PARTNERSHIP_STORE) private readonly partnership: PartnershipStore,
    @Inject(forwardRef(() => ExpensesService))
    private readonly expenses: ExpensesService,
  ) {}

  async createNeed(
    actor: AuthActor,
    workspaceId: string,
    body: CreateNeedRequest,
  ): Promise<NeedSummary> {
    await this.requireWritableMember(workspaceId, actor.userId);
    return this.store.createNeed(actor.userId, { ...body, workspaceId });
  }

  async listNeeds(actor: AuthActor, workspaceId: string): Promise<NeedSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listNeeds(workspaceId);
  }

  async fulfillNeed(actor: AuthActor, workspaceId: string, needId: string): Promise<NeedSummary> {
    await this.requireWritableMember(workspaceId, actor.userId);
    try {
      return await this.store.fulfillNeed(workspaceId, needId);
    } catch (error: unknown) {
      this.rethrowNeedError(error);
    }
  }

  async cancelNeed(actor: AuthActor, workspaceId: string, needId: string): Promise<NeedSummary> {
    await this.requireWritableMember(workspaceId, actor.userId);
    try {
      return await this.store.cancelNeed(workspaceId, needId);
    } catch (error: unknown) {
      this.rethrowNeedError(error);
    }
  }

  async createPurchaseRequest(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePurchaseRequestRequest,
  ): Promise<PurchaseRequestSummary> {
    await this.requireWritableMember(workspaceId, actor.userId);
    return this.store.createPurchaseRequest(actor.userId, { ...body, workspaceId });
  }

  async submitPurchaseRequest(
    actor: AuthActor,
    workspaceId: string,
    requestId: string,
  ): Promise<PurchaseRequestSummary> {
    await this.requireWritableMember(workspaceId, actor.userId);
    try {
      return await this.store.submitPurchaseRequest(workspaceId, requestId);
    } catch (error: unknown) {
      this.rethrowPrError(error);
    }
  }

  async decidePurchaseRequest(
    actor: AuthActor,
    workspaceId: string,
    body: SubmitApprovalRequest,
  ): Promise<PurchaseRequestSummary> {
    await this.requireApprover(workspaceId, actor.userId);
    try {
      return await this.store.decidePurchaseRequest(
        workspaceId,
        body.purchaseRequestId,
        body.decision,
      );
    } catch (error: unknown) {
      this.rethrowPrError(error);
    }
  }

  async listPurchaseRequests(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<PurchaseRequestSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listPurchaseRequests(workspaceId);
  }

  async createBudget(
    actor: AuthActor,
    workspaceId: string,
    body: CreateBudgetRequest,
  ): Promise<BudgetSummary> {
    await this.requireWritableMember(workspaceId, actor.userId);
    if (body.ceiling.currency !== "IRR" || BigInt(body.ceiling.amountMinor) <= 0n) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid budget ceiling",
        status: 400,
      });
    }
    return this.store.createBudget({ ...body, workspaceId });
  }

  async listBudgets(actor: AuthActor, workspaceId: string): Promise<BudgetSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listBudgets(workspaceId);
  }

  async createVendor(
    actor: AuthActor,
    workspaceId: string,
    body: CreateVendorRequest,
  ): Promise<VendorSummary> {
    await this.requireBuyer(workspaceId, actor.userId);
    return this.store.createVendor({ ...body, workspaceId });
  }

  async listVendors(actor: AuthActor, workspaceId: string): Promise<VendorSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listVendors(workspaceId);
  }

  async createPurchaseOrder(
    actor: AuthActor,
    workspaceId: string,
    body: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderSummary> {
    await this.requireBuyer(workspaceId, actor.userId);
    try {
      const frozen = await this.resolveFrozenPricing(workspaceId, body);
      return await this.store.createPurchaseOrder(actor.userId, { ...body, workspaceId }, frozen);
    } catch (error: unknown) {
      this.rethrowProcError(error);
    }
  }

  async cancelPurchaseOrder(
    actor: AuthActor,
    workspaceId: string,
    orderId: string,
  ): Promise<PurchaseOrderSummary> {
    await this.requireBuyer(workspaceId, actor.userId);
    try {
      return await this.store.cancelPurchaseOrder(workspaceId, orderId);
    } catch (error: unknown) {
      this.rethrowProcError(error);
    }
  }

  async linkPurchaseOrderExpense(
    actor: AuthActor,
    workspaceId: string,
    orderId: string,
    body: LinkPurchaseOrderExpenseRequest,
  ): Promise<PurchaseOrderSummary> {
    await this.requireBuyer(workspaceId, actor.userId);
    const po = await this.store.getPurchaseOrder(workspaceId, orderId);
    if (!po) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Purchase order not found",
        status: 404,
      });
    }
    if (po.expenseId) {
      return po;
    }
    const draft = await this.expenses.createDraft(actor, workspaceId, {
      workspaceId,
      title: `PO: ${po.title}`,
      total: po.amount,
      paidByUserId: actor.userId,
      splitMethod: "equal",
      participantUserIds: [actor.userId],
      visibility: "company",
      requiresApproval: true,
      idempotencyKey: body.idempotencyKey,
      note: `Linked purchase order ${po.id}`,
    });
    try {
      return await this.store.linkPurchaseOrderExpense(workspaceId, orderId, draft.id);
    } catch (error: unknown) {
      this.rethrowProcError(error);
    }
  }

  async listPurchaseOrders(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<PurchaseOrderSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listPurchaseOrders(workspaceId);
  }

  async recordDelivery(
    actor: AuthActor,
    workspaceId: string,
    body: RecordDeliveryRequest,
  ): Promise<DeliverySummary> {
    await this.requireBuyer(workspaceId, actor.userId);
    if (body.expectedQuantity <= 0 || body.receivedQuantity < 0) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid delivery quantities",
        status: 400,
      });
    }
    try {
      return await this.store.recordDelivery(actor.userId, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrowProcError(error);
    }
  }

  async listDeliveries(actor: AuthActor, workspaceId: string): Promise<DeliverySummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listDeliveries(workspaceId);
  }

  private async resolveFrozenPricing(
    workspaceId: string,
    body: CreatePurchaseOrderRequest,
  ): Promise<FrozenPurchaseOrderPricing | undefined> {
    if (body.partnerPriceId) {
      const price = await this.partnership.getAgreedPrice(workspaceId, body.partnerPriceId);
      if (!price) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Partner price not found",
          status: 400,
        });
      }
      return {
        amount: price.amount,
        partnerPriceId: price.id,
        catalogItemId: price.catalogItemId ?? body.catalogItemId,
      };
    }
    if (body.catalogPriceId) {
      const row = await this.catalog.getPriceById(body.catalogPriceId);
      if (!row) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Catalog price not found",
          status: 400,
        });
      }
      const amount: Money = {
        amountMinor: row.priceMinor.toString(),
        currency: "IRR",
      };
      return {
        amount,
        catalogPriceId: row.id,
        catalogItemId: body.catalogItemId ?? row.itemId,
      };
    }
    if (body.catalogItemId) {
      const item = await this.catalog.getItem(body.catalogItemId);
      if (!item || item.workspaceId !== workspaceId) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Catalog item not found",
          status: 400,
        });
      }
      return {
        amount: { amountMinor: item.referencePriceMinor.toString(), currency: "IRR" },
        catalogItemId: item.id,
      };
    }
    return undefined;
  }

  private rethrowNeedError(error: unknown): never {
    if (error instanceof Error && error.message === "NEED_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Need not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "NEED_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid need status",
        status: 400,
      });
    }
    throw error;
  }

  private rethrowProcError(error: unknown): never {
    if (error instanceof Error && error.message === "PR_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Purchase request not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "VENDOR_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Vendor not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "PO_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Purchase order not found",
        status: 404,
      });
    }
    if (
      error instanceof Error &&
      (error.message === "PR_STATUS" ||
        error.message === "PR_NOT_APPROVED" ||
        error.message === "PO_CANCELLED" ||
        error.message === "PO_STATUS")
    ) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid procurement state",
        status: 400,
      });
    }
    throw error;
  }

  private rethrowPrError(error: unknown): never {
    if (error instanceof Error && error.message === "PR_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Purchase request not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "PR_STATUS") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid purchase request status",
        status: 400,
      });
    }
    throw error;
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }

  private async requireWritableMember(workspaceId: string, userId: string): Promise<void> {
    await this.requireMember(workspaceId, userId);
    const members = await this.iam.listMembers(workspaceId, userId);
    const self = members?.find((row) => row.userId === userId);
    if (!self || isReadOnlyRole(self.role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/read-only-role",
        title: "Read-only role",
        status: 403,
        detail: "نقش ناظر/مهمان مجاز به تغییر نیست",
      });
    }
  }

  private async requireApprover(workspaceId: string, userId: string): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, userId);
    const self = members?.find((m) => m.userId === userId);
    if (
      !self ||
      !roleInSet(self.role, PROCUREMENT_APPROVER_ROLES)
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Approver role required",
        status: 403,
      });
    }
  }

  private async requireBuyer(workspaceId: string, userId: string): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, userId);
    const self = members?.find((m) => m.userId === userId);
    if (!self || !roleInSet(self.role, PROCUREMENT_BUYER_ROLES)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Buyer role required",
        status: 403,
      });
    }
  }
}
