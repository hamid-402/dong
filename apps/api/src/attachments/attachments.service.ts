import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { isClamavEnabled } from "@dang/config";
import {
  type AttachmentSummary,
  type AuthActor,
  type CreateAttachmentRequest,
  type OcrReceiptResult,
  type QuarantineScanResult,
  type UploadAttachmentContentRequest,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { JobsService } from "../jobs/jobs.service.js";
import { AttachmentBlobService } from "./attachment-blob.service.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "./attachment.store.js";
import {
  isAvUnavailableScanResult,
  mayServeStoredAttachment,
  mayStartOcr,
} from "./av-policy.js";
import { scanAttachmentContent } from "./av-scanner.js";
import { runReceiptOcr } from "./ocr.client.js";

function avUnavailableException(detail?: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    type: "https://dang.local/problems/av-unavailable",
    title: "Antivirus unavailable",
    status: 503,
    detail: detail ?? "ClamAV scan could not complete",
  });
}

function quarantineBlockedException(
  quarantineStatus: AttachmentSummary["quarantineStatus"] | undefined,
): BadRequestException {
  return new BadRequestException({
    type: "https://dang.local/problems/quarantine-blocked",
    title:
      quarantineStatus === "error"
        ? "Attachment quarantine scan failed"
        : "Attachment blocked by quarantine",
    status: 400,
  });
}

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AttachmentBlobService) private readonly blobs: AttachmentBlobService,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateAttachmentRequest,
  ): Promise<AttachmentSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    try {
      let current = await this.attachments.create(actor.userId, {
        ...body,
        workspaceId,
      });
      if (current.quarantineStatus === "pending") {
        // Stub AV can scan metadata-only. With ClamAV enabled, wait for bytes
        // (uploadContent) so missing blob does not fail-closed the create.
        const existingBlob = await this.blobs.read(workspaceId, current.id);
        if (existingBlob || !isClamavEnabled()) {
          await this.scanQuarantine(actor, workspaceId, current.id);
          current =
            (await this.attachments.getById(workspaceId, current.id)) ?? current;
        }
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
    await this.access.requireMember(workspaceId, actor.userId);
    return this.attachments.listForTarget(workspaceId, targetType, targetId);
  }

  async scanQuarantine(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
  ): Promise<QuarantineScanResult> {
    await this.access.requireMember(workspaceId, actor.userId);
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
    // Fail-closed upload/scan: ClamAV error → 503; row stays error (not servable).
    if (isAvUnavailableScanResult(evaluated.status)) {
      throw avUnavailableException(evaluated.detail);
    }
    return result;
  }

  async runOcr(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
  ): Promise<OcrReceiptResult> {
    await this.access.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment not found",
        status: 404,
      });
    }
    if (!mayStartOcr(attachment.quarantineStatus)) {
      throw quarantineBlockedException(attachment.quarantineStatus);
    }
    const job = await this.jobs.run("ocr.receipt", workspaceId, {
      attachmentId,
      fileName: attachment.fileName,
    });
    const blob = await this.blobs.read(workspaceId, attachmentId);
    const result = await runReceiptOcr({
      attachmentId,
      workspaceId,
      jobId: job.jobId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      bytes: blob ?? undefined,
    });
    await this.attachments.saveOcrResult(workspaceId, attachmentId, result);
    return result;
  }

  async uploadContent(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
    body: UploadAttachmentContentRequest,
  ): Promise<AttachmentSummary> {
    await this.access.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment not found",
        status: 404,
      });
    }
    if (
      attachment.quarantineStatus === "blocked" ||
      attachment.quarantineStatus === "error"
    ) {
      throw quarantineBlockedException(attachment.quarantineStatus);
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
    const { sniffUploadMime } = await import("@dang/contracts");
    const sniffed = sniffUploadMime(new Uint8Array(buffer));
    if (!sniffed || sniffed !== attachment.mimeType.trim()) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Uploaded content does not match declared mimeType",
        status: 400,
        code: "ATTACHMENT_CONTENT_MIME",
      });
    }
    // When ClamAV is enabled, scan before marking the blob servable.
    if (isClamavEnabled()) {
      const evaluated = await scanAttachmentContent({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        contentHash: attachment.contentHash,
        bytes: buffer,
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
      if (isAvUnavailableScanResult(evaluated.status)) {
        // Do not write/markBlobStored — attachment stays non-servable.
        throw avUnavailableException(evaluated.detail);
      }
      if (evaluated.status === "blocked") {
        // Malware: persist quarantine status but never store the blob.
        throw quarantineBlockedException("blocked");
      }
    }
    const storagePath = await this.blobs.write(workspaceId, attachmentId, buffer);
    return this.attachments.markBlobStored(workspaceId, attachmentId, storagePath);
  }

  async getContent(
    actor: AuthActor,
    workspaceId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    await this.access.requireMember(workspaceId, actor.userId);
    const attachment = await this.attachments.getById(workspaceId, attachmentId);
    if (!attachment?.hasBlob) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Attachment content not found",
        status: 404,
      });
    }
    // Stored status only — never re-scan (ClamAV outage must not block clean).
    // blocked/error always refused; pending refused only when CLAMAV_ENABLED.
    if (
      !mayServeStoredAttachment(attachment.quarantineStatus, {
        clamavEnabled: isClamavEnabled(),
      })
    ) {
      throw quarantineBlockedException(attachment.quarantineStatus);
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
}
