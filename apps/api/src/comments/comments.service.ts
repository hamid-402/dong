import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { AuthActor, CommentSummary, CreateCommentRequest } from "@dang/contracts";
import { resolveExpenseListOptions } from "../expenses/expense-list-options.js";
import {
  canActorViewExpense,
  EXPENSE_STORE,
  type ExpenseStore,
} from "../expenses/expense.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { COMMENT_STORE, type CommentStore } from "./comment.store.js";

@Injectable()
export class CommentsService {
  constructor(
    @Inject(COMMENT_STORE) private readonly comments: CommentStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(EXPENSE_STORE) private readonly expenses: ExpenseStore,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateCommentRequest,
  ): Promise<CommentSummary> {
    await this.requireMember(workspaceId, actor.userId);
    await this.assertCanAccessTarget(
      workspaceId,
      actor.userId,
      body.targetType,
      body.targetId,
    );
    try {
      return await this.comments.create(actor.userId, { ...body, workspaceId });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "COMMENT_BODY") {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Invalid comment",
          status: 400,
          detail: "Body must be 1-2000 characters",
        });
      }
      throw error;
    }
  }

  async list(
    actor: AuthActor,
    workspaceId: string,
    targetType: CreateCommentRequest["targetType"],
    targetId: string,
  ): Promise<CommentSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    await this.assertCanAccessTarget(workspaceId, actor.userId, targetType, targetId);
    return this.comments.listForTarget(workspaceId, targetType, targetId, actor.userId);
  }

  private async assertCanAccessTarget(
    workspaceId: string,
    actorUserId: string,
    targetType: CreateCommentRequest["targetType"],
    targetId: string,
  ): Promise<void> {
    if (targetType !== "expense") return;

    const { viewAllPrivate } = await resolveExpenseListOptions(
      this.iam,
      workspaceId,
      actorUserId,
    );
    const expense = await this.expenses.get(workspaceId, targetId, actorUserId);
    if (!expense || !canActorViewExpense(expense, actorUserId, { viewAllPrivate })) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not allowed to access comments for this expense",
        status: 403,
      });
    }
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
  }
}
