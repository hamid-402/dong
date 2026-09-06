import {
  and,
  asc,
  comment,
  createDatabase,
  eq,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { CommentSummary, CreateCommentRequest } from "@dang/contracts";
import type { CommentStore } from "./comment.store.js";

function mapComment(row: typeof comment.$inferSelect): CommentSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    targetType: row.targetType as CommentSummary["targetType"],
    targetId: row.targetId,
    authorUserId: row.authorUserId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PostgresCommentStore implements CommentStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresCommentStore {
    const { db } = createDatabase(connectionString);
    return new PostgresCommentStore(db);
  }

  async create(actorUserId: string, input: CreateCommentRequest): Promise<CommentSummary> {
    if (!input.body?.trim() || input.body.trim().length > 2000) {
      throw new Error("COMMENT_BODY");
    }
    return withTenantContext(
      this.db,
      { workspaceId: input.workspaceId, userId: actorUserId },
      async (tx) => {
        const inserted = await tx
          .insert(comment)
          .values({
            workspaceId: input.workspaceId,
            targetType: input.targetType,
            targetId: input.targetId,
            authorUserId: actorUserId,
            body: input.body.trim(),
          })
          .returning();
        const row = inserted[0];
        if (!row) throw new Error("COMMENT_INSERT_FAILED");
        return mapComment(row);
      },
    );
  }

  async listForTarget(
    workspaceId: string,
    targetType: CommentSummary["targetType"],
    targetId: string,
    actorUserId: string,
  ): Promise<CommentSummary[]> {
    return withTenantContext(
      this.db,
      { workspaceId, userId: actorUserId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(comment)
          .where(
            and(
              eq(comment.workspaceId, workspaceId),
              eq(comment.targetType, targetType),
              eq(comment.targetId, targetId),
            ),
          )
          .orderBy(asc(comment.createdAt));
        return rows.map(mapComment);
      },
    );
  }
}
