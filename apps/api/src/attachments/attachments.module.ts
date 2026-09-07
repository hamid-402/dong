import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
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
  return createPersistenceStore<AttachmentStore>({
    name: "attachment store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresAttachmentStore.fromConnectionString(url),
    createMemory: () => new MemoryAttachmentStore(),
  });
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
