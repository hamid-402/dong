import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  Body,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActor,
  CreateStatementExportRequest,
  MemberStatementDetail,
  StatementExportSummary,
  WorkspaceStatementsResponse,
} from "@dang/contracts";
import {
  createStatementExportRequestSchema,
  statementDetailQuerySchema,
  statementListQuerySchema,
  statementNotifyRequestSchema,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { StatementsService } from "./statements.service.js";

@ApiTags("statements")
@Controller("workspaces/:workspaceId/statements")
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Member statement summaries for a date range" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query(new ZodValidationPipe(statementListQuerySchema))
    query: { from: string; to: string; granularity: "day" | "period" },
  ): Promise<WorkspaceStatementsResponse> {
    return this.statements.listSummaries(
      actor,
      workspaceId,
      query.from,
      query.to,
      query.granularity,
    );
  }

  @Get("exports/:exportId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Statement export status" })
  getExport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("exportId") exportId: string,
  ): Promise<StatementExportSummary> {
    return this.statements.getExport(actor, workspaceId, exportId);
  }

  @Get("exports/:exportId/download")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Download statement export file" })
  @Header("Cache-Control", "no-store")
  async download(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("exportId") exportId: string,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const file = await this.statements.downloadPayload(actor, workspaceId, exportId);
    reply.header("Content-Type", file.mimeType);
    reply.header(
      "Content-Disposition",
      `attachment; filename="${file.fileName.replaceAll('"', "")}"`,
    );
    reply.send(file.body);
  }

  @Get(":userId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Item-level statement for one member" })
  detail(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Query(new ZodValidationPipe(statementDetailQuerySchema))
    query: { from: string; to: string },
  ): Promise<MemberStatementDetail> {
    return this.statements.getDetail(actor, workspaceId, userId, query.from, query.to);
  }

  @Post(":userId/exports")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create CSV or JSON statement export" })
  createExport(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(createStatementExportRequestSchema))
    body: CreateStatementExportRequest,
  ): Promise<StatementExportSummary> {
    return this.statements.createExport(actor, workspaceId, userId, body);
  }

  @Post(":userId/notify")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Notify member that a statement range is ready (finance)" })
  notify(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(statementNotifyRequestSchema))
    body: { from: string; to: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ notified: true; href: string }> {
    return this.statements.notifyMember(
      actor,
      workspaceId,
      userId,
      body.from,
      body.to,
      reply,
    );
  }
}
