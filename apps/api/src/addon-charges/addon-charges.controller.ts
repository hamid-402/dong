import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreatePersonalAddonChargeRequest,
  DisputePersonalAddonChargeRequest,
  PersonalAddonChargeSummary,
} from "@dang/contracts";
import {
  createPersonalAddonChargeRequestSchema,
  disputePersonalAddonChargeRequestSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AddonChargesService } from "./addon-charges.service.js";

@ApiTags("addon-charges")
@ApiHeader({ name: "x-dang-subject", required: false })
@Controller("workspaces/:workspaceId/addon-charges")
@UseGuards(AuthGuard)
export class AddonChargesController {
  constructor(
    @Inject(AddonChargesService)
    private readonly addonCharges: AddonChargesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List visible personal add-on charges" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<PersonalAddonChargeSummary[]> {
    return this.addonCharges.list(actor, workspaceId);
  }

  @Post()
  @ApiOperation({ summary: "Create a pending personal add-on charge" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPersonalAddonChargeRequestSchema))
    body: CreatePersonalAddonChargeRequest,
  ): Promise<PersonalAddonChargeSummary> {
    return this.addonCharges.create(actor, workspaceId, body);
  }

  @Post(":id/confirm")
  @ApiOperation({ summary: "Confirm a pending personal add-on charge" })
  confirm(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("id") chargeId: string,
  ): Promise<PersonalAddonChargeSummary> {
    return this.addonCharges.confirm(actor, workspaceId, chargeId);
  }

  @Post(":id/dispute")
  @ApiOperation({ summary: "Dispute a pending personal add-on charge" })
  dispute(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("id") chargeId: string,
    @Body(new ZodValidationPipe(disputePersonalAddonChargeRequestSchema))
    body: DisputePersonalAddonChargeRequest,
  ): Promise<PersonalAddonChargeSummary> {
    return this.addonCharges.dispute(
      actor,
      workspaceId,
      chargeId,
      body?.note,
    );
  }
}
