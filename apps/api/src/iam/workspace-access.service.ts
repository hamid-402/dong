import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  isFinanceManagerRole,
  isReadOnlyRole,
  type MembershipRole,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "./iam.types.js";

@Injectable()
export class WorkspaceAccessService {
  constructor(@Inject(IAM_STORE) private readonly iam: IamStore) {}

  async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
        detail: "عضویت فضای کاری لازم است",
      });
    }
  }

  async requireMemberRole(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipRole> {
    const members = (await this.iam.listMembers(workspaceId, userId)) ?? [];
    const me = members.find((m) => m.userId === userId);
    if (!me) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
        detail: "عضویت فضای کاری لازم است",
      });
    }
    return me.role;
  }

  async requireFinanceManager(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipRole> {
    const role = await this.requireMemberRole(workspaceId, userId);
    if (!isFinanceManagerRole(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "فقط مدیر مالی / مادرخرج می‌تواند این کار را انجام دهد",
        status: 403,
      });
    }
    return role;
  }

  assertNotReadOnly(role: MembershipRole): void {
    if (isReadOnlyRole(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "این نقش فقط خواندنی است",
        status: 403,
        detail: "Auditor or guest cannot mutate finance records",
      });
    }
  }
}
