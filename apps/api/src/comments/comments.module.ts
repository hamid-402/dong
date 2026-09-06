import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { COMMENT_STORE, MemoryCommentStore, type CommentStore } from "./comment.store.js";
import { CommentsController } from "./comments.controller.js";
import { CommentsService } from "./comments.service.js";
import { PostgresCommentStore } from "./postgres-comment.store.js";

const logger = createLogger("dang-api-comments");

function buildCommentStore(): CommentStore {
  const env = loadAppEnv();
  if (!env.databaseUrl) {
    logger.warn("DATABASE_URL unset; using in-memory comment store");
    return new MemoryCommentStore();
  }
  try {
    logger.info("Using PostgreSQL comment store");
    return PostgresCommentStore.fromConnectionString(env.databaseUrl);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    logger.error("Failed to initialize PostgreSQL comment store; falling back to memory", {
      detail,
    });
    return new MemoryCommentStore();
  }
}

@Module({
  imports: [AuthModule],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    { provide: COMMENT_STORE, useFactory: buildCommentStore },
  ],
  exports: [COMMENT_STORE, CommentsService],
})
export class CommentsModule {}
