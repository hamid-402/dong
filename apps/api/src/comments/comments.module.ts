import { Module } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { AuthModule } from "../auth/auth.module.js";
import { createPersistenceStore } from "../common/postgres-store.factory.js";
import { ExpensesModule } from "../expenses/expenses.module.js";
import { COMMENT_STORE, MemoryCommentStore, type CommentStore } from "./comment.store.js";
import { CommentsController } from "./comments.controller.js";
import { CommentsService } from "./comments.service.js";
import { PostgresCommentStore } from "./postgres-comment.store.js";

const logger = createLogger("dang-api-comments");

function buildCommentStore(): CommentStore {
  const env = loadAppEnv();
  return createPersistenceStore<CommentStore>({
    name: "comment store",
    databaseUrl: env.databaseUrl,
    logger,
    createPostgres: (url) => PostgresCommentStore.fromConnectionString(url),
    createMemory: () => new MemoryCommentStore(),
  });
}

@Module({
  imports: [AuthModule, ExpensesModule],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    { provide: COMMENT_STORE, useFactory: buildCommentStore },
  ],
  exports: [COMMENT_STORE, CommentsService],
})
export class CommentsModule {}
