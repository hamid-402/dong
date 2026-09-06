import {
  and,
  attachment,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type {
  AttachmentSummary,
  CommentTargetType,
  CreateAttachmentRequest,
  QuarantineScanResult,
} from "@dang/contracts";
import { assertAllowedUploadMime, evaluateQuarantine } from "@dang/contracts";
import type { AttachmentStore } from "./attachment.store.js";

const MAX_BYTES = 10 * 1024 * 1024;

function mapAttachment(row: typeof attachment.$inferSelect): AttachmentSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    targetType: row.targetType as CommentTargetType,
    targetId: row.targetId,
    kind: row.kind as AttachmentSummary["kind"],
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    contentHash: row.contentHash,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt.toISOString(),
    ocrJobId: row.ocrJobId ?? undefined,
    quarantineStatus: row.quarantineStatus as AttachmentSummary["quarantineStatus"],
    hasBlob: Boolean(row.storagePath),
  };
}

export class PostgresAttachmentStore implements AttachmentStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresAttachmentStore {
    const { db } = createDatabase(connectionString);
    return new PostgresAttachmentStore(db);
  }

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

    const scan = evaluateQuarantine({
      fileName: input.fileName.trim(),
      mimeType: input.mimeType.trim(),
      contentHash: input.contentHash.toLowerCase(),
    });
    const quarantineStatus = scan.status === "blocked" ? "blocked" : "pending";
    const ocrJobId =
      input.kind === "receipt" && scan.status !== "blocked" ? crypto.randomUUID() : null;

    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const existing = await tx
          .select()
          .from(attachment)
          .where(
            and(
              eq(attachment.workspaceId, input.workspaceId),
              eq(attachment.idempotencyKey, input.idempotencyKey.trim()),
            ),
          )
          .limit(1);
        if (existing[0]) return mapAttachment(existing[0]);

        const inserted = await tx
          .insert(attachment)
          .values({
            workspaceId: input.workspaceId,
            targetType: input.targetType,
            targetId: input.targetId,
            kind: input.kind,
            fileName: input.fileName.trim(),
            mimeType: input.mimeType.trim(),
            sizeBytes: input.sizeBytes,
            contentHash: input.contentHash.toLowerCase(),
            uploadedByUserId: actorUserId,
            idempotencyKey: input.idempotencyKey.trim(),
            ocrJobId,
            quarantineStatus,
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("ATTACHMENT_INSERT_FAILED");
        return mapAttachment(row);
      },
    );
  }

  listForTarget(
    workspaceId: string,
    targetType: CommentTargetType,
    targetId: string,
  ): Promise<AttachmentSummary[]> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(attachment)
        .where(
          and(
            eq(attachment.workspaceId, workspaceId),
            eq(attachment.targetType, targetType),
            eq(attachment.targetId, targetId),
          ),
        );
      return rows.map(mapAttachment);
    });
  }

  getById(workspaceId: string, attachmentId: string): Promise<AttachmentSummary | undefined> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(attachment)
        .where(
          and(eq(attachment.id, attachmentId), eq(attachment.workspaceId, workspaceId)),
        )
        .limit(1);
      return rows[0] ? mapAttachment(rows[0]) : undefined;
    });
  }

  applyQuarantine(
    workspaceId: string,
    attachmentId: string,
    result: QuarantineScanResult,
  ): Promise<AttachmentSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const rows = await tx
        .select()
        .from(attachment)
        .where(
          and(eq(attachment.id, attachmentId), eq(attachment.workspaceId, workspaceId)),
        )
        .limit(1);
      if (!rows[0]) throw new Error("ATTACHMENT_NOT_FOUND");

      const updated = await tx
        .update(attachment)
        .set({ quarantineStatus: result.status })
        .where(eq(attachment.id, attachmentId))
        .returning();
      return mapAttachment(updated[0]!);
    });
  }

  markBlobStored(
    workspaceId: string,
    attachmentId: string,
    storagePath: string,
  ): Promise<AttachmentSummary> {
    return withTenantContext(this.db, { workspaceId }, async (tx) => {
      const updated = await tx
        .update(attachment)
        .set({ storagePath })
        .where(
          and(eq(attachment.id, attachmentId), eq(attachment.workspaceId, workspaceId)),
        )
        .returning();
      if (!updated[0]) throw new Error("ATTACHMENT_NOT_FOUND");
      return mapAttachment(updated[0]);
    });
  }
}
