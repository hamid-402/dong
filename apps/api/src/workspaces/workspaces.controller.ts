import { Body, Controller, Get, Headers, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  workspaceTemplateCatalog,
  type AuthActor,
  type CreateWorkspaceRequest,
  type MembershipSummary,
  type WorkspaceSummary,
  type WorkspaceTemplateCatalogItem,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { WorkspacesService } from "./workspaces.service.js";

@ApiTags("workspaces")
@Controller("workspaces")
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService)
    private readonly workspaces: WorkspacesService,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get("templates")
  @ApiOperation({
    summary: "List workspace templates used during onboarding",
  })
  @ApiOkResponse({
    schema: {
      example: workspaceTemplateCatalog,
    },
  })
  listTemplates(): WorkspaceTemplateCatalogItem[] {
    return workspaceTemplateCatalog;
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List workspaces for the current actor" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  listMine(@CurrentActor() actor: AuthActor): Promise<WorkspaceSummary[]> {
    return this.workspaces.listForActor(actor);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a workspace and owner membership" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Body() body: CreateWorkspaceRequest,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<WorkspaceSummary> {
    return this.idempotency.run("workspace.create", actor.userId, idempotencyKey, () =>
      this.workspaces.create(actor, body),
    );
  }

  @Get(":workspaceId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Get a workspace the actor belongs to" })
  getOne(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.getForActor(actor, workspaceId);
  }

  @Get(":workspaceId/members")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List memberships inside a workspace" })
  listMembers(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<MembershipSummary[]> {
    return this.workspaces.listMembers(actor, workspaceId);
  }
}
