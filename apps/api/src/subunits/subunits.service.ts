import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateWorkspaceSubunitBody,
  UpdateWorkspaceSubunitBody,
  WorkspaceSubunitSummary,
} from "@dang/contracts";
import { isFinanceManagerRole, spaceKindForTemplate } from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import {
  WORKSPACE_SUBUNIT_STORE,
  type WorkspaceSubunitStore,
} from "./subunit.types.js";

@Injectable()
export class SubunitsService {
  constructor(
    @Inject(WORKSPACE_SUBUNIT_STORE) private readonly store: WorkspaceSubunitStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
  ) {}

  private async requireManager(workspaceId: string, userId: string) {
    const members = (await this.iam.listMembers(workspaceId, userId)) ?? [];
    const me = members.find((m) => m.userId === userId && !m.disabledAt);
    if (!me) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "عضویت لازم است",
        status: 403,
      });
    }
    if (!isFinanceManagerRole(me.role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مدیر مالی / مالک می‌تواند زیرمجموعه را مدیریت کند",
        status: 403,
      });
    }
    return members;
  }

  private async requireMember(workspaceId: string, userId: string) {
    const ws = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!ws) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "عضویت لازم است",
        status: 403,
      });
    }
    return ws;
  }

  async list(actor: AuthActor, workspaceId: string): Promise<WorkspaceSubunitSummary[]> {
    await this.requireMember(workspaceId, actor.userId);
    return this.store.list(workspaceId, actor.userId);
  }

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    const ws = await this.requireMember(workspaceId, actor.userId);
    await this.requireManager(workspaceId, actor.userId);
    const kind = spaceKindForTemplate(ws.template);
    if (kind === "personal" || kind === "group") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "زیرمجموعه برای فضای شخصی/گروهی فعال نیست",
        detail: "واحدها برای ساختمان و بخش‌ها برای سازمان هستند.",
        status: 400,
      });
    }
    if (kind === "building" && body.kind !== "unit") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "در ساختمان فقط «واحد» مجاز است",
        status: 400,
        code: "SUBUNIT_KIND",
      });
    }
    if (kind === "org" && body.kind === "unit") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "در سازمان از بخش یا شرکت زیرمجموعه استفاده کنید",
        status: 400,
        code: "SUBUNIT_KIND",
      });
    }
    try {
      return await this.store.create(workspaceId, actor.userId, body);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async update(
    actor: AuthActor,
    workspaceId: string,
    subunitId: string,
    body: UpdateWorkspaceSubunitBody,
  ): Promise<WorkspaceSubunitSummary> {
    const members = await this.requireManager(workspaceId, actor.userId);
    if (body.memberUserIds) {
      const active = new Set(
        members.filter((m) => !m.disabledAt).map((m) => m.userId),
      );
      for (const id of body.memberUserIds) {
        if (!active.has(id)) {
          throw new BadRequestException({
            type: "https://dang.local/problems/validation",
            title: "عضو زیرمجموعه باید عضو فعال فضا باشد",
            status: 400,
            code: "SUBUNIT_MEMBER_INVALID",
          });
        }
      }
    }
    try {
      return await this.store.update(workspaceId, subunitId, actor.userId, body);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  async remove(
    actor: AuthActor,
    workspaceId: string,
    subunitId: string,
  ): Promise<void> {
    await this.requireManager(workspaceId, actor.userId);
    try {
      await this.store.remove(workspaceId, subunitId, actor.userId);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  private mapError(error: unknown): never {
    if (!(error instanceof Error)) throw error;
    if (error.message === "SUBUNIT_CODE_EXISTS") {
      throw new ConflictException({
        type: "https://dang.local/problems/conflict",
        title: "کد زیرمجموعه تکراری است",
        status: 409,
        code: "SUBUNIT_CODE_EXISTS",
      });
    }
    if (error.message === "SUBUNIT_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "زیرمجموعه پیدا نشد",
        status: 404,
      });
    }
    throw error;
  }
}
