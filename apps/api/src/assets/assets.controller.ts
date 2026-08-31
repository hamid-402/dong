import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AssetSummary,
  AssignAssetRequest,
  AuthActor,
  CreateAssetFromDeliveryRequest,
  DamageAssetRequest,
  ReturnAssetRequest,
  TransferAssetRequest,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AssetsService } from "./assets.service.js";

@ApiTags("assets")
@Controller("workspaces/:workspaceId")
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @Post("assets/from-delivery")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Convert a delivery line to a durable asset" })
  createFromDelivery(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateAssetFromDeliveryRequest,
  ): Promise<AssetSummary> {
    return this.assets.createFromDelivery(actor, workspaceId, body);
  }

  @Get("assets")
  @UseGuards(AuthGuard)
  listAssets(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<AssetSummary[]> {
    return this.assets.listAssets(actor, workspaceId);
  }

  @Post("assets/assign")
  @UseGuards(AuthGuard)
  assign(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: AssignAssetRequest,
  ): Promise<AssetSummary> {
    return this.assets.assign(actor, workspaceId, body);
  }

  @Post("assets/transfer")
  @UseGuards(AuthGuard)
  transfer(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: TransferAssetRequest,
  ): Promise<AssetSummary> {
    return this.assets.transfer(actor, workspaceId, body);
  }

  @Post("assets/return")
  @UseGuards(AuthGuard)
  markReturned(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: ReturnAssetRequest,
  ): Promise<AssetSummary> {
    return this.assets.markReturned(actor, workspaceId, body);
  }

  @Post("assets/damage")
  @UseGuards(AuthGuard)
  markDamaged(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: DamageAssetRequest,
  ): Promise<AssetSummary> {
    return this.assets.markDamaged(actor, workspaceId, body);
  }
}
