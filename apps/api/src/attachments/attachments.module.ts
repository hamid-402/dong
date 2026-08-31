import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { ATTACHMENT_STORE, MemoryAttachmentStore } from "./attachment.store.js";
import { AttachmentsController } from "./attachments.controller.js";
import { AttachmentsService } from "./attachments.service.js";

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    { provide: ATTACHMENT_STORE, useFactory: () => new MemoryAttachmentStore() },
  ],
  exports: [ATTACHMENT_STORE, AttachmentsService],
})
export class AttachmentsModule {}
