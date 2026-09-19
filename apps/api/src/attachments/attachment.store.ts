import type {
  AttachmentSummary,
  CommentTargetType,
  CreateAttachmentRequest,
  OcrReceiptResult,
  QuarantineScanResult,
} from "@dang/contracts";
import { assertAllowedUploadMime, evaluateQuarantine } from "@dang/contracts";

export type AttachmentStore = {
  readonly persistence: "memory" | "postgres";
  create(actorUserId: string, input: CreateAttachmentRequest): Promise<AttachmentSummary>;
  listForTarget(
    workspaceId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): Promise<AttachmentSummary[]>;
  getById(workspaceId: string, attachmentId: string): Promise<AttachmentSummary | undefined>;
  applyQuarantine(
    workspaceId: string,
    attachmentId: string,
    result: QuarantineScanResult,
  ): Promise<AttachmentSummary>;
  markBlobStored(
    workspaceId: string,
    attachmentId: string,
    storagePath: string,
  ): Promise<AttachmentSummary>;
  saveOcrResult(
    workspaceId: string,
    attachmentId: string,
    result: OcrReceiptResult,
  ): Promise<AttachmentSummary>;
  /**
   * Safe retention: clear blob pointers for blocked quarantine rows older than `olderThanDays`.
   * Does not delete metadata rows.
   */
  purgeOldBlockedBlobs(olderThanDays?: number, nowIso?: string): Promise<number>;
  /** Count rows that would be purged by {@link purgeOldBlockedBlobs} (dry-run). */
  countOldBlockedBlobs(olderThanDays?: number, nowIso?: string): Promise<number>;
};

export const ATTACHMENT_STORE = Symbol("ATTACHMENT_STORE");

const MAX_BYTES = 10 * 1024 * 1024;

export class MemoryAttachmentStore implements AttachmentStore {
  readonly persistence = "memory" as const;
  private readonly attachments = new Map<string, AttachmentSummary>();
  private readonly idempotency = new Map<string, string>();

  create(actorUserId: string, input: CreateAttachmentRequest): Promise<AttachmentSummary> {
    if (!input.fileName?.trim() || !input.mimeType?.trim()) {
      return Promise.reject(new Error("ATTACHMENT_META"));
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
      return Promise.reject(new Error("ATTACHMENT_SIZE"));
    }
    if (!/^[a-f0-9]{64}$/i.test(input.contentHash)) {
      return Promise.reject(new Error("ATTACHMENT_HASH"));
    }
    try {
      assertAllowedUploadMime(input.mimeType);
    } catch {
      return Promise.reject(new Error("ATTACHMENT_MIME"));
    }

    const idemKey = `${input.workspaceId}:${input.idempotencyKey.trim()}`;
    const existingId = this.idempotency.get(idemKey);
    if (existingId) {
      const existing = this.attachments.get(existingId);
      if (existing) return Promise.resolve(existing);
    }

    const scan = evaluateQuarantine({
      fileName: input.fileName.trim(),
      mimeType: input.mimeType.trim(),
      contentHash: input.contentHash.toLowerCase(),
    });

    const attachment: AttachmentSummary = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      targetId: input.targetId,
      kind: input.kind,
      fileName: input.fileName.trim(),
      mimeType: input.mimeType.trim(),
      sizeBytes: input.sizeBytes,
      contentHash: input.contentHash.toLowerCase(),
      uploadedByUserId: actorUserId,
      createdAt: new Date().toISOString(),
      quarantineStatus: scan.status === "blocked" ? "blocked" : "pending",
      ocrJobId:
        input.kind === "receipt" && scan.status !== "blocked"
          ? crypto.randomUUID()
          : undefined,
      hasBlob: false,
    };
    this.attachments.set(attachment.id, attachment);
    this.idempotency.set(idemKey, attachment.id);
    return Promise.resolve(attachment);
  }

  listForTarget(
    workspaceId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): Promise<AttachmentSummary[]> {
    return Promise.resolve(
      [...this.attachments.values()].filter(
        (a) =>
          a.workspaceId === workspaceId &&
          a.targetType === targetType &&
          a.targetId === targetId,
      ),
    );
  }

  getById(workspaceId: string, attachmentId: string): Promise<AttachmentSummary | undefined> {
    const row = this.attachments.get(attachmentId);
    if (!row || row.workspaceId !== workspaceId) return Promise.resolve(undefined);
    return Promise.resolve(row);
  }

  applyQuarantine(
    workspaceId: string,
    attachmentId: string,
    result: QuarantineScanResult,
  ): Promise<AttachmentSummary> {
    const row = this.attachments.get(attachmentId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ATTACHMENT_NOT_FOUND"));
    }
    const updated: AttachmentSummary = {
      ...row,
      quarantineStatus: result.status,
    };
    this.attachments.set(attachmentId, updated);
    return Promise.resolve(updated);
  }

  markBlobStored(
    workspaceId: string,
    attachmentId: string,
    _storagePath: string,
  ): Promise<AttachmentSummary> {
    const row = this.attachments.get(attachmentId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ATTACHMENT_NOT_FOUND"));
    }
    const updated: AttachmentSummary = { ...row, hasBlob: true };
    this.attachments.set(attachmentId, updated);
    return Promise.resolve(updated);
  }

  saveOcrResult(
    workspaceId: string,
    attachmentId: string,
    result: OcrReceiptResult,
  ): Promise<AttachmentSummary> {
    const row = this.attachments.get(attachmentId);
    if (!row || row.workspaceId !== workspaceId) {
      return Promise.reject(new Error("ATTACHMENT_NOT_FOUND"));
    }
    const updated: AttachmentSummary = {
      ...row,
      ocrJobId: result.jobId,
      ocrResult: {
        jobId: result.jobId,
        status: result.status,
        merchantHint: result.merchantHint,
        amountMinorHint: result.amountMinorHint,
        rawTextPreview: result.rawTextPreview,
        completedAt: result.completedAt,
      },
    };
    this.attachments.set(attachmentId, updated);
    return Promise.resolve(updated);
  }

  purgeOldBlockedBlobs(olderThanDays = 90, nowIso = new Date().toISOString()): Promise<number> {
    const cutoffMs = Date.parse(nowIso) - olderThanDays * 24 * 60 * 60 * 1000;
    let n = 0;
    for (const [id, row] of this.attachments) {
      if (row.quarantineStatus !== "blocked" || !row.hasBlob) continue;
      if (Date.parse(row.createdAt) > cutoffMs) continue;
      this.attachments.set(id, { ...row, hasBlob: false });
      n += 1;
    }
    return Promise.resolve(n);
  }

  countOldBlockedBlobs(olderThanDays = 90, nowIso = new Date().toISOString()): Promise<number> {
    const cutoffMs = Date.parse(nowIso) - olderThanDays * 24 * 60 * 60 * 1000;
    let n = 0;
    for (const row of this.attachments.values()) {
      if (row.quarantineStatus !== "blocked" || !row.hasBlob) continue;
      if (Date.parse(row.createdAt) > cutoffMs) continue;
      n += 1;
    }
    return Promise.resolve(n);
  }
}
