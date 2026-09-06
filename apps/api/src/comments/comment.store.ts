import type {
  CommentSummary,
  CommentTargetType,
  CreateCommentRequest,
} from "@dang/contracts";

export type CommentStore = {
  readonly persistence: "memory" | "postgres";
  create(actorUserId: string, input: CreateCommentRequest): Promise<CommentSummary>;
  listForTarget(
    workspaceId: string,
    targetType: CommentTargetType,
    targetId: string,
    actorUserId: string,
  ): Promise<CommentSummary[]>;
};

export const COMMENT_STORE = Symbol("COMMENT_STORE");

export class MemoryCommentStore implements CommentStore {
  readonly persistence = "memory" as const;
  private readonly comments: CommentSummary[] = [];

  create(actorUserId: string, input: CreateCommentRequest): Promise<CommentSummary> {
    if (!input.body?.trim() || input.body.trim().length > 2000) {
      return Promise.reject(new Error("COMMENT_BODY"));
    }
    const comment: CommentSummary = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      targetId: input.targetId,
      authorUserId: actorUserId,
      body: input.body.trim(),
      createdAt: new Date().toISOString(),
    };
    this.comments.push(comment);
    return Promise.resolve(comment);
  }

  listForTarget(
    workspaceId: string,
    targetType: CommentTargetType,
    targetId: string,
    _actorUserId: string,
  ): Promise<CommentSummary[]> {
    return Promise.resolve(
      this.comments.filter(
        (c) =>
          c.workspaceId === workspaceId &&
          c.targetType === targetType &&
          c.targetId === targetId,
      ),
    );
  }
}
