import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { COMMENT_STORE, MemoryCommentStore } from "./comment.store.js";
import { CommentsController } from "./comments.controller.js";
import { CommentsService } from "./comments.service.js";

@Module({
  imports: [AuthModule],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    { provide: COMMENT_STORE, useFactory: () => new MemoryCommentStore() },
  ],
  exports: [COMMENT_STORE, CommentsService],
})
export class CommentsModule {}
