import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  evaluateQuarantine,
  runStubOcr,
  type AttachmentSummary,
  type AuthActor,
  type CreateAttachmentRequest,
  type OcrReceiptResult,
  type QuarantineScanResult,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { JobsService } from "../jobs/jobs.service.js";
import { ATTACHMENT_STORE, type AttachmentStore } from "./attachment.store.js";

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateAttachmentRequest,
  ): Promise<AttachmentSummary> {
    await this.requireMember(workspaceId, actor.userId);
    try {
      const created = await this.attachments.create(actor.userId, {
        ...body,
        workspaceId,
      });
      if (created.quarantineStatus === "pending") {
        await this.scanQuarantine(actor, workspaceId, created.id);
      }
      if (created.ocrJobId && created.quarantineStatus !== "blocked") {
        this.jobs.run("ocr.receipt", workspaceId, {
          attachmentId: created.id,
          fileName: created.fileName,
        });
      }
      return (await this.attachments.getById(workspaceId, created.id)) ?? created;
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
    this.jobs.run("quarantine.scan", workspaceId, { attachmentId });
    const evaluated = evaluateQuarantine({
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      contentHash: attachment.contentHash,
    });
    const result: QuarantineScanResult = {
      attachmentId,
      workspaceId,
      scannedAt: new Date().toISOString(),
      ...evaluated,
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
    if (attachment.quarantineStatus === "blocked") {
      throw new BadRequestException({
        type: "https://dang.local/problems/quarantine-blocked",
        title: "Attachment blocked by quarantine",
        status: 400,
      });
    }
    const job = this.jobs.run("ocr.receipt", workspaceId, {
      attachmentId,
      fileName: attachment.fileName,
    });
    return runStubOcr({
      attachmentId,
      workspaceId,
      jobId: job.jobId,
      fileName: attachment.fileName,
    });
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
