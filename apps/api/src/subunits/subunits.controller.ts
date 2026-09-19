import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateWorkspaceSubunitBody,
  UpdateWorkspaceSubunitBody,
  WorkspaceSubunitSummary,
} from "@dang/contracts";
import {
  createWorkspaceSubunitSchema,
  updateWorkspaceSubunitSchema,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SubunitsService } from "./subunits.service.js";

@ApiTags("subunits")
@Controller("workspaces/:workspaceId/subunits")
@UseGuards(AuthGuard)
export class SubunitsController {
  constructor(@Inject(SubunitsService) private readonly service: SubunitsService) {}

  @Get()
  @ApiOperation({ summary: "List building units or org departments" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceSubunitSummary[]> {
    return this.service.list(actor, workspaceId);
  }

  @Post()
  @ApiOperation({ summary: "Create a subunit (unit / department / subsidiary)" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createWorkspaceSubunitSchema))
    body: CreateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    return this.service.create(actor, workspaceId, body);
  }

  @Patch(":subunitId")
  @ApiOperation({ summary: "Update subunit and/or assigned members" })
  update(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("subunitId") subunitId: string,
    @Body(new ZodValidationPipe(updateWorkspaceSubunitSchema))
    body: UpdateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    return this.service.update(actor, workspaceId, subunitId, body);
  }

  @Delete(":subunitId")
  @ApiOperation({ summary: "Delete a subunit" })
  remove(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("subunitId") subunitId: string,
  ): Promise<void> {
    return this.service.remove(actor, workspaceId, subunitId);
  }
}
