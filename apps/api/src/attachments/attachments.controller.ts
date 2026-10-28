import { Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RouteConfig } from "@nestjs/platform-fastify";
import type {
  AttachmentSummary,
  AuthActor,
  CreateAttachmentRequest,
  CreatePaymentReceiptAttachmentRequestInput,
  OcrReceiptResult,
  QuarantineScanResult,
  UploadAttachmentContentRequest,
  UploadPaymentReceiptContentRequestInput,
} from "@dang/contracts";
import {
  createAttachmentRequestSchema,
  createPaymentReceiptAttachmentRequestSchema,
  PAYMENT_RECEIPT_MAX_BYTES,
  uploadAttachmentContentRequestSchema,
  uploadPaymentReceiptContentRequestSchema,
} from "@dang/contracts";
import type { FastifyReply } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AttachmentsService } from "./attachments.service.js";

/**
 * Nest `@RouteConfig({ bodyLimit })` lands in Fastify `config`, not route `bodyLimit`.
 * Bridge copies `config.bodyLimit` → top-level `bodyLimit` so Fastify returns 413.
 * Must be registered on the Fastify instance BEFORE Nest registerRouter (e.g. in main.ts).
 */
export function bridgeNestRouteConfigBodyLimit(fastify: {
  addHook: (
    name: "onRoute",
    handler: (opts: {
      config?: { bodyLimit?: number };
      bodyLimit?: number;
    }) => void,
  ) => void;
}): void {
  fastify.addHook("onRoute", (opts) => {
    const limit = opts.config?.bodyLimit;
    if (typeof limit === "number" && opts.bodyLimit === undefined) {
      opts.bodyLimit = limit;
    }
  });
}

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
    @Body(new ZodValidationPipe(createAttachmentRequestSchema)) body: CreateAttachmentRequest,
  ): Promise<AttachmentSummary> {
    return this.attachments.create(actor, workspaceId, body);
  }

  @Post("payment-receipt")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Register payment-receipt evidence metadata (Zod sizeBytes ≤ 5MB; expense uses POST /attachments)",
  })
  createPaymentReceipt(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createPaymentReceiptAttachmentRequestSchema))
    body: CreatePaymentReceiptAttachmentRequestInput,
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
  @ApiOperation({
    summary: "Run AV quarantine scan (stub or ClamAV; 503 when ClamAV enabled and scan errors)",
  })
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

  @Post(":attachmentId/payment-receipt-content")
  @RouteConfig({ bodyLimit: PAYMENT_RECEIPT_MAX_BYTES })
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Upload payment-receipt bytes (base64); Fastify bodyLimit 5MB → HTTP 413 when exceeded",
  })
  uploadPaymentReceiptContent(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("attachmentId") attachmentId: string,
    @Body(new ZodValidationPipe(uploadPaymentReceiptContentRequestSchema))
    body: UploadPaymentReceiptContentRequestInput,
  ): Promise<AttachmentSummary> {
    return this.attachments.uploadContent(actor, workspaceId, attachmentId, body);
  }

  @Post(":attachmentId/content")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Upload attachment bytes (base64); hash must match metadata; 503 when ClamAV enabled and scan errors",
  })
  uploadContent(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("attachmentId") attachmentId: string,
    @Body(new ZodValidationPipe(uploadAttachmentContentRequestSchema))
    body: UploadAttachmentContentRequest,
  ): Promise<AttachmentSummary> {
    return this.attachments.uploadContent(actor, workspaceId, attachmentId, body);
  }

  @Get(":attachmentId/content")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Download stored attachment bytes (400 quarantine-blocked for blocked/error; pending blocked when CLAMAV_ENABLED; clean without rescan)",
  })
  async downloadContent(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const file = await this.attachments.getContent(actor, workspaceId, attachmentId);
    reply.header("Content-Type", file.mimeType);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    return file.buffer;
  }
}