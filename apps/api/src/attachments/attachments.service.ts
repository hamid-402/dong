import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type AttachmentSummary,
  type AuthActor,
  type CreateAttachmentRequest,
  type OcrReceiptResult,
  type QuarantineScanResult,
  type UploadAttachmentContentRequest,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { JobsService } from "../jobs/jobs.service.js";
import { AttachmentBlobService } from "./attachment-blob.service.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "./attachment.store.js";
import { mayStartOcr } from "./av-policy.js";
import { scanAttachmentContent } from "./av-scanner.js";
import { runReceiptOcr } from "./ocr.client.js";

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AttachmentBlobService) private readonly blobs: AttachmentBlobService,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateAttachmentRequest,
  ): Promise<AttachmentSummary> {
    await this.requireMember(workspaceId, actor.userId);
    try {
      let current = await this.attachments.create(actor.userId, {
        ...body,
        workspaceId,
      });
      if (current.quarantineStatus === "pending") {
        await this.scanQuarantine(actor, workspaceId, current.id);
        current =
          (await this.attachments.getById(workspaceId, current.id)) ?? current;
      }
      // Fail-closed: never OCR when quarantine is blocked or error (scan errors persist as error).
      if (current.ocrJobId && mayStartOcr(current.quarantineStatus)) {
        void this.jobs
          .run("ocr.receipt", workspaceId, {
            attachmentId: current.id,
            fileName: current.fileName,
          })
          .catch(() => undefined);
      }
      return current;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const map: Record<string, string> = {
          ATTACHMENT_META: "fileName and mimeType required",
          ATTACHMENT_SIZE: "sizeBytes must be 1..10MB",
          ATTACHMENT_HASH: "contentHash must be SHA-256 hex",
          ATTACHMENT_MIME: "mimeType not on allow-list",
        };
        const detail = map[error.message];
        if (detail) {
          throw new BadRequestException({
            type: "https://dang.local/problems/validation",
            title: "Invalid attachment",
            status: 400,
            detail,
          });
        }
      }
      throw error;
    }
  }

  async list(
    actor: AuthActor,
    workspaceId: string,
    targetType: CreateAttachmentRequest["targetType"],
    targetId: string,
  ): Promise<AttachmentSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.attachments.listForTarget(workspaceId, targetType, targetId);
  }

  async scanQuarantine(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
  ): Promise<QuarantineScanResult> {
    await this.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment not found",
        status: 404,
      });
    }
    void this.jobs
      .run("quarantine.scan", workspaceId, { attachmentId })
      .catch(() => undefined);
    const blob = await this.blobs.read(workspaceId, attachmentId);
    const evaluated = await scanAttachmentContent({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      contentHash: attachment.contentHash,
      bytes: blob ?? undefined,
    });
    const result: QuarantineScanResult = {
      attachmentId,
      workspaceId,
      scannedAt: new Date().toISOString(),
      status: evaluated.status,
      engine: evaluated.engine,
      detail: evaluated.detail,
      contentHash: evaluated.contentHash,
    };
    await this.attachments.applyQuarantine(workspaceId, attachmentId, result);
    return result;
  }

  async runOcr(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
  ): Promise<OcrReceiptResult> {
    await this.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment not found",
        status: 404,
      });
    }
    if (!mayStartOcr(attachment.quarantineStatus)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/quarantine-blocked",
        title:
          attachment.quarantineStatus === "error"
            ? "Attachment quarantine scan failed"
            : "Attachment blocked by quarantine",
        status: 400,
      });
    }
    const job = await this.jobs.run("ocr.receipt", workspaceId, {
      attachmentId,
      fileName: attachment.fileName,
    });
    const blob = await this.blobs.read(workspaceId, attachmentId);
    return runReceiptOcr({
      attachmentId,
      workspaceId,
      jobId: job.jobId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      bytes: blob ?? undefined,
    });
  }

  async uploadContent(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
    body: UploadAttachmentContentRequest,
  ): Promise<AttachmentSummary> {
    await this.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment not found",
        status: 404,
      });
    }
    if (attachment.quarantineStatus === "blocked") {
      throw new BadRequestException({
        type: "https://dang.local/problems/quarantine-blocked",
        title: "Attachment blocked by quarantine",
        status: 400,
      });
    }
    const encoded = body.contentBase64?.trim();
    if (!encoded) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "contentBase64 required",
        status: 400,
      });
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(encoded, "base64");
    } catch {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid base64 payload",
        status: 400,
      });
    }
    if (buffer.length !== attachment.sizeBytes) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Uploaded size does not match attachment metadata",
        status: 400,
      });
    }
    const hash = this.blobs.hashBuffer(buffer);
    if (hash !== attachment.contentHash.toLowerCase()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "contentHash mismatch",
        status: 400,
      });
    }
    const storagePath = await this.blobs.write(workspaceId, attachmentId, buffer);
    return this.attachments.markBlobStored(workspaceId, attachmentId, storagePath);
  }

  async getContent(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    await this.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment?.hasBlob) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment content not found",
        status: 404,
      });
    }
    const buffer = await this.blobs.read(workspaceId, attachmentId);
    if (!buffer) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment blob missing on disk",
        status: 404,
      });
    }
    return {
      buffer,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  blobMode() {
    return this.blobs.mode();
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }
}
