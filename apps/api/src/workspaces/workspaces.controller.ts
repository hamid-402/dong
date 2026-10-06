import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  createWorkspaceRequestSchema,
  leaveWorkspaceRequestSchema,
  softDeleteWorkspaceRequestSchema,
  updateWorkspaceRequestSchema,
  workspaceTemplateCatalog,
  type AuthActor,
  type CreateWorkspaceRequest,
  type LeaveWorkspaceRequest,
  type MembershipSummary,
  type SoftDeleteWorkspaceRequest,
  type UpdateWorkspaceRequest,
  type WorkspaceDirectoryResponse,
  type WorkspaceJoinPreview,
  type WorkspaceSummary,
  type WorkspaceTemplateCatalogItem,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
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

  @Get("by-slug/:slug")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Preview a workspace by public group id (slug) for join requests",
  })
  previewBySlug(
    @Param("slug") slug: string,
  ): Promise<WorkspaceJoinPreview> {
    return this.workspaces.previewBySlug(slug);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List workspaces for the current actor" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  listMine(@CurrentActor() actor: AuthActor): Promise<WorkspaceSummary[]> {
    return this.workspaces.listForActor(actor);
  }

  @Get("directory")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Lightweight workspace directory for switcher/finder (optional bounded metrics)",
  })
  @ApiQuery({
    name: "metrics",
    required: false,
    description:
      "When 1/true, attach myNetMinor + openSettlements if membership count ≤ cap",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  directoryMine(
    @CurrentActor() actor: AuthActor,
    @Query("metrics") metrics?: string,
  ): Promise<WorkspaceDirectoryResponse> {
    const includeMetrics =
      metrics === "1" || metrics?.toLowerCase() === "true";
    return this.workspaces.directoryForActor(actor, { includeMetrics });
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a workspace and owner membership" })
  @ApiHeader({ name: "x-dang-subject", required: false })
  @ApiHeader({ name: "idempotency-key", required: false })
  create(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createWorkspaceRequestSchema)) body: CreateWorkspaceRequest,
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

  @Patch(":workspaceId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Update owner/admin managed workspace profile fields" })
  updateProfile(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(updateWorkspaceRequestSchema))
    body: UpdateWorkspaceRequest,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.updateProfile(actor, workspaceId, body);
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

  @Post(":workspaceId/leave")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Leave workspace (soft-disable own membership; owners must transfer first)",
  })
  leave(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(leaveWorkspaceRequestSchema))
    body: LeaveWorkspaceRequest,
  ): Promise<MembershipSummary> {
    return this.workspaces.leave(actor, workspaceId, body ?? {});
  }

  @Post(":workspaceId/archive")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Archive workspace (owner only; ledger retained)" })
  archive(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.archive(actor, workspaceId);
  }

  @Post(":workspaceId/unarchive")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Restore an archived workspace (owner only)" })
  unarchive(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.unarchive(actor, workspaceId);
  }

  @Post(":workspaceId/soft-delete")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Soft-delete workspace (owner only; confirmSlug must match)",
  })
  softDelete(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(softDeleteWorkspaceRequestSchema))
    body: SoftDeleteWorkspaceRequest,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.softDelete(actor, workspaceId, body);
  }
}
