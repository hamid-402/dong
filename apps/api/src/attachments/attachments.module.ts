import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import {
  ATTACHMENT_STORE,
  MemoryAttachmentStore,
  type AttachmentStore,
} from "./attachment.store.js";
import { PostgresAttachmentStore } from "./postgres-attachment.store.js";
import { AttachmentsController } from "./attachments.controller.js";
import { AttachmentsService } from "./attachments.service.js";
import { AttachmentBlobService } from "./attachment-blob.service.js";

const logger = createLogger("dang-api-attachments");

export function createAttachmentStore(): AttachmentStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory attachment store");
    return new MemoryAttachmentStore();
  }
  try {
    logger.info("Using PostgreSQL attachment store");
    return PostgresAttachmentStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL attachment store; falling back to memory", {
      detail,
    });
    return new MemoryAttachmentStore();
  }
}

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentBlobService,
    { provide: ATTACHMENT_STORE, useFactory: createAttachmentStore },
  ],
  exports: [ATTACHMENT_STORE, AttachmentsService, AttachmentBlobService],
})
export class AttachmentsModule {}
