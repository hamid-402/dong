import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CostCenterSummary,
  CreateCostCenterRequest,
} from "@dang/contracts";
import { createCostCenterRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CostCentersService } from "./cost-centers.service.js";

@ApiTags("cost-centers")
@Controller("workspaces/:workspaceId/cost-centers")
@UseGuards(AuthGuard)
export class CostCentersController {
  constructor(
    @Inject(CostCentersService) private readonly service: CostCentersService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List workspace cost centers" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<CostCenterSummary[]> {
    return this.service.list(actor, workspaceId);
  }

  @Post()
  @ApiOperation({ summary: "Create a workspace cost center" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCostCenterRequestSchema))
    body: CreateCostCenterRequest,
  ): Promise<CostCenterSummary> {
    return this.service.create(actor, workspaceId, body);
  }
}
