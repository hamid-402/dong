import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, CommentSummary, CreateCommentRequest } from "@dang/contracts";
import { createCommentRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CommentsService } from "./comments.service.js";

@ApiTags("comments")
@Controller("workspaces/:workspaceId/comments")
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly comments: CommentsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Add a threaded comment on a target" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createCommentRequestSchema)) body: CreateCommentRequest,
  ): Promise<CommentSummary> {
    return this.comments.create(actor, workspaceId, body);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List comments for a target" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("targetType") targetType: CreateCommentRequest["targetType"],
    @Query("targetId") targetId: string,
  ): Promise<CommentSummary[]> {
    return this.comments.list(actor, workspaceId, targetType, targetId);
  }
}
