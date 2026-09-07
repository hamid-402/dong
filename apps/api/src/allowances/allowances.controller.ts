import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateMemberAllowanceRequestInput,
  MemberAllowanceSummary,
  MemberAllowanceUsage,
} from "@dang/contracts";
import { createMemberAllowanceRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AllowancesService } from "./allowances.service.js";

@Controller("workspaces/:workspaceId/allowances")
@UseGuards(AuthGuard)
export class AllowancesController {
  constructor(
    @Inject(AllowancesService) private readonly allowances: AllowancesService,
  ) {}

  @Get()
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<MemberAllowanceSummary[]> {
    return this.allowances.list(actor, workspaceId);
  }

  @Post()
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createMemberAllowanceRequestSchema))
    body: CreateMemberAllowanceRequestInput,
  ): Promise<MemberAllowanceSummary> {
    return this.allowances.create(actor, workspaceId, body);
  }

  @Get("usage")
  usage(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<MemberAllowanceUsage[]> {
    return this.allowances.usage(actor, workspaceId);
  }
}
