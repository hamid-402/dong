import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateSplitPresetRequest,
  SplitPresetSummary,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { SplitPresetsService } from "./split-presets.service.js";

@ApiTags("split-presets")
@Controller("workspaces/:workspaceId/split-presets")
export class SplitPresetsController {
  constructor(
    @Inject(SplitPresetsService) private readonly presets: SplitPresetsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List workspace split presets" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<SplitPresetSummary[]> {
    return this.presets.list(actor, workspaceId);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a split preset" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateSplitPresetRequest,
  ): Promise<SplitPresetSummary> {
    return this.presets.create(actor, workspaceId, body);
  }

  @Get(":presetId")
  @UseGuards(AuthGuard)
  get(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("presetId") presetId: string,
  ): Promise<SplitPresetSummary> {
    return this.presets.get(actor, workspaceId, presetId);
  }

  @Delete(":presetId")
  @UseGuards(AuthGuard)
  remove(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("presetId") presetId: string,
  ): Promise<{ deleted: boolean }> {
    return this.presets.remove(actor, workspaceId, presetId);
  }
}
