import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AssetSummary,
  AssignAssetRequest,
  AuthActor,
  CreateAssetFromDeliveryRequest,
  DamageAssetRequest,
  ReturnAssetRequest,
  TransferAssetRequest,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import {
  PROCUREMENT_STORE,
  type ProcurementStore,
} from "../procurement/procurement.types.js";
import { ASSETS_STORE, MemoryAssetsStore } from "./assets.store.js";

@Injectable()
export class AssetsService {
  constructor(
    @Inject(ASSETS_STORE) private readonly store: MemoryAssetsStore,
    @Inject(PROCUREMENT_STORE) private readonly procurement: ProcurementStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  async createFromDelivery(
    actor: AuthActor,
    workspaceId: string,
    body: CreateAssetFromDeliveryRequest,
  ): Promise<AssetSummary> {
    await this.requireMember(workspaceId, actor.userId);
    try {
      return await this.store.createFromDelivery(this.procurement, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrowAssetError(error);
    }
  }

  async listAssets(actor: AuthActor, workspaceId: string): Promise<AssetSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.listAssets(workspaceId);
  }

  async assign(
    actor: AuthActor,
    workspaceId: string,
    body: AssignAssetRequest,
  ): Promise<AssetSummary> {
    await this.requireCustodianRole(workspaceId, actor.userId);
    try {
      return await this.store.assign(workspaceId, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrowAssetError(error);
    }
  }

  async transfer(
    actor: AuthActor,
    workspaceId: string,
    body: TransferAssetRequest,
  ): Promise<AssetSummary> {
    await this.requireCustodianRole(workspaceId, actor.userId);
    try {
      return await this.store.transfer(workspaceId, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrowAssetError(error);
    }
  }

  async markReturned(
    actor: AuthActor,
    workspaceId: string,
    body: ReturnAssetRequest,
  ): Promise<AssetSummary> {
    await this.requireMember(workspaceId, actor.userId);
    try {
      return await this.store.markReturned(workspaceId, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrowAssetError(error);
    }
  }

  async markDamaged(
    actor: AuthActor,
    workspaceId: string,
    body: DamageAssetRequest,
  ): Promise<AssetSummary> {
    await this.requireCustodianRole(workspaceId, actor.userId);
    try {
      return await this.store.markDamaged(workspaceId, { ...body, workspaceId });
    } catch (error: unknown) {
      this.rethrowAssetError(error);
    }
  }

  private rethrowAssetError(error: unknown): never {
    if (error instanceof Error) {
      if (error.message === "DELIVERY_NOT_FOUND" || error.message === "ASSET_NOT_FOUND") {
        throw new NotFoundException({
          type: "https://dang.local/problems/not-found",
          title: "Resource not found",
          status: 404,
        });
      }
      if (error.message === "ASSET_STATUS" || error.message === "PO_NOT_FOUND") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Invalid asset state",
          status: 400,
        });
      }
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

  private async requireCustodianRole(workspaceId: string, userId: string): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, userId);
    const self = members?.find((m) => m.userId === userId);
    if (
      !self ||
      !["owner", "admin", "buyer", "asset_custodian"].includes(self.role)
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Asset custodian role required",
        status: 403,
      });
    }
  }
}
