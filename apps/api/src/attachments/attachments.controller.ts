import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AttachmentSummary,
  AuthActor,
  CreateAttachmentRequest,
  OcrReceiptResult,
  QuarantineScanResult,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AttachmentsService } from "./attachments.service.js";

@ApiTags("attachments")
@Controller("workspaces/:workspaceId/attachments")
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Register receipt/document metadata (no binary custody)" })
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateAttachmentRequest,
  ): Promise<AttachmentSummary> {
    return this.attachments.create(actor, workspaceId, body);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List attachments for a target" })
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("targetType") targetType: CreateAttachmentRequest["targetType"],
    @Query("targetId") targetId: string,
  ): Promise<AttachmentSummary[]> {
    return this.attachments.list(actor, workspaceId, targetType, targetId);
  }

  @Post(":attachmentId/quarantine")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Run stub AV quarantine scan" })
  quarantine(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("attachmentId") attachmentId: string,
  ): Promise<QuarantineScanResult> {
    return this.attachments.scanQuarantine(actor, workspaceId, attachmentId);
  }

  @Post(":attachmentId/ocr")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Run stub OCR on a clean receipt attachment" })
  ocr(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("attachmentId") attachmentId: string,
  ): Promise<OcrReceiptResult> {
    return this.attachments.runOcr(actor, workspaceId, attachmentId);
  }
}
