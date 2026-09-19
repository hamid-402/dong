import { Inject, Injectable } from "@nestjs/common";
import {
  ATTACHMENT_STORE,
  type AttachmentStore,
} from "../attachments/attachment.store.js";
import {
  STATEMENTS_EXPORT_STORE,
  type StatementsExportStore,
} from "../statements/statements.types.js";

export type RetentionPurgeResult = {
  statementBodies: number;
  attachmentBlobs: number;
  ranAt: string;
  dryRun: boolean;
};

/**
 * Platform retention sweep — statements export body expiry + blocked attachment blobs.
 * Honest: postgres cross-tenant counts depend on DB role (migrator vs FORCE RLS).
 */
@Injectable()
export class RetentionService {
  constructor(
    @Inject(STATEMENTS_EXPORT_STORE) private readonly exports: StatementsExportStore,
    @Inject(ATTACHMENT_STORE) private readonly attachments: AttachmentStore,
  ) {}

  /** Preview counts without mutating storage (G12 #53). */
  async previewPurge(olderThanDays = 90): Promise<RetentionPurgeResult> {
    const [statementBodies, attachmentBlobs] = await Promise.all([
      this.exports.countExpiredBodies(),
      this.attachments.countOldBlockedBlobs(olderThanDays),
    ]);
    return {
      statementBodies,
      attachmentBlobs,
      ranAt: new Date().toISOString(),
      dryRun: true,
    };
  }

  async runPurge(): Promise<RetentionPurgeResult> {
    const [statementBodies, attachmentBlobs] = await Promise.all([
      this.exports.purgeExpiredBodies(),
      this.attachments.purgeOldBlockedBlobs(90),
    ]);
    return {
      statementBodies,
      attachmentBlobs,
      ranAt: new Date().toISOString(),
      dryRun: false,
    };
  }
}
