import {
  BadRequestException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateExpenseTagRequest,
  ExpenseTagSummary,
  SetExpenseTagsRequest,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  EXPENSE_TAGS_STORE,
  type ExpenseTagsStore,
} from "./expense-tags.store.js";

@Injectable()
export class ExpenseTagsService {
  constructor(
    @Inject(EXPENSE_TAGS_STORE) private readonly tags: ExpenseTagsStore,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateExpenseTagRequest,
  ): Promise<ExpenseTagSummary> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    try {
      return await this.tags.create(workspaceId, actor.userId, body);
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<ExpenseTagSummary[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    return this.tags.list(workspaceId, actor.userId);
  }

  async setExpenseTags(
    actor: AuthActor,
    workspaceId: string,
    expenseId: string,
    body: SetExpenseTagsRequest,
  ): Promise<{ tagIds: string[] }> {
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    this.access.assertNotReadOnly(role);
    try {
      const tagIds = await this.tags.setExpenseTags(
        workspaceId,
        expenseId,
        actor.userId,
        body.tagIds ?? [],
      );
      return { tagIds };
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  /** Direct store access for ExpensesService enrichment. */
  store(): ExpenseTagsStore {
    return this.tags;
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error) {
      const map: Record<string, string> = {
        TAG_NAME: "Tag name must be 1-64 characters",
        TAG_SLUG_TAKEN: "Tag slug already exists in this workspace",
        TAG_NOT_FOUND: "One or more tag ids were not found",
      };
      const detail = map[error.message];
      if (detail) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Invalid expense tag",
          status: 400,
          detail,
        });
      }
    }
    throw error;
  }
}
