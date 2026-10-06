import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AddWorkspaceMemberBody,
  ApproveJoinRequestBody,
  AuthActor,
  CreateJoinRequestBody,
  DisableWorkspaceMemberBody,
  JoinRequestSummary,
  MembershipRole,
  MembershipSummary,
  OwnershipTransferSummary,
  ProposeOwnershipTransferBody,
  UpdateWorkspaceMemberBody,
} from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { ASSIGNABLE_MEMBER_ROLES } from "../iam/membership-rules.js";

function problem(
  status: number,
  code: string,
  title: string,
  detail?: string,
): Record<string, unknown> {
  return {
    type: `https://dang.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    detail,
    code,
  };
}

function mapStoreError(error: unknown): never {
  if (!(error instanceof Error)) throw error;
  switch (error.message) {
    case "LAST_FINANCE_MANAGER":
      throw new ConflictException(
        problem(409, "LAST_FINANCE_MANAGER", "Cannot remove last finance manager"),
      );
    case "MEMBER_ALREADY_EXISTS":
      throw new ConflictException(
        problem(409, "MEMBER_ALREADY_EXISTS", "Member already exists"),
      );
    case "JOIN_REQUEST_PENDING":
      throw new ConflictException(
        problem(409, "JOIN_REQUEST_PENDING", "Join request already pending"),
      );
    case "CANNOT_CREATE_USER_ACCOUNT":
      throw new ForbiddenException(
        problem(
          403,
          "CANNOT_CREATE_USER_ACCOUNT",
          "Cannot create user accounts from membership",
          "مادرخرج فقط می‌تواند کاربران موجود را اضافه کند",
        ),
      );
    case "MEMBERSHIP_FORBIDDEN":
      throw new ForbiddenException(
        problem(403, "MEMBERSHIP_FORBIDDEN", "Membership action forbidden"),
      );
    case "MEMBER_NOT_FOUND":
    case "JOIN_REQUEST_NOT_FOUND":
    case "OWNERSHIP_TRANSFER_NOT_FOUND":
    case "WORKSPACE_NOT_FOUND":
      throw new NotFoundException(
        problem(404, error.message, "Not found"),
      );
    case "OWNERSHIP_TRANSFER_PENDING":
      throw new ConflictException(
        problem(409, "OWNERSHIP_TRANSFER_PENDING", "Transfer already pending"),
      );
    case "OWNERSHIP_TRANSFER_EXPIRED":
      throw new GoneException(
        problem(410, "OWNERSHIP_TRANSFER_EXPIRED", "Ownership transfer expired"),
      );
    case "FINANCE_QUORUM_REQUIRED":
      throw new ConflictException(
        problem(
          409,
          "FINANCE_QUORUM_REQUIRED",
          "Finance manager quorum required",
          "این گروه حداقل به یک مادرخرج (مدیر مالی) فعال نیاز دارد. نقش را روی «مادرخرج / مدیر مالی» یا «ادمین» بگذارید؛ بعد می‌توانید عضو عادی بیاورید.",
        ),
      );
    default:
      throw error;
  }
}

@Injectable()
export class MembershipService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
  ) {}

  private assertAssignableRole(role: MembershipRole): void {
    if (role === "owner" || !ASSIGNABLE_MEMBER_ROLES.includes(role)) {
      throw new BadRequestException(
        problem(400, "INVALID_ROLE", "Role is not assignable via membership APIs"),
      );
    }
  }

  async addMember(
    actor: AuthActor,
    workspaceId: string,
    body: AddWorkspaceMemberBody,
  ): Promise<MembershipSummary> {
    this.assertAssignableRole(body.role as MembershipRole);
    try {
      const member = await this.iam.addMemberByUserId({
        workspaceId,
        actorUserId: actor.userId,
        userId: body.userId,
        role: body.role as MembershipRole,
        defaultShares: body.defaultShares,
        addedVia: "user_id",
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.add",
        targetType: "membership",
        targetId: body.userId,
        result: "success",
        metadata: { role: body.role, addedVia: "user_id" },
      });
      return member;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async updateMember(
    actor: AuthActor,
    workspaceId: string,
    targetUserId: string,
    body: UpdateWorkspaceMemberBody,
  ): Promise<MembershipSummary> {
    if (body.role) this.assertAssignableRole(body.role as MembershipRole);
    try {
      const member = await this.iam.changeMemberRole({
        workspaceId,
        actorUserId: actor.userId,
        targetUserId,
        role: body.role as MembershipRole | undefined,
        defaultShares: body.defaultShares,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.update",
        targetType: "membership",
        targetId: targetUserId,
        result: "success",
        metadata: {
          role: body.role ?? null,
          defaultShares: body.defaultShares ?? null,
        },
      });
      return member;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async disableMember(
    actor: AuthActor,
    workspaceId: string,
    targetUserId: string,
    body: DisableWorkspaceMemberBody,
  ): Promise<MembershipSummary> {
    try {
      const member = await this.iam.disableMember({
        workspaceId,
        actorUserId: actor.userId,
        targetUserId,
        reason: body.reason,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.disable",
        targetType: "membership",
        targetId: targetUserId,
        result: "success",
        metadata: { reason: body.reason },
      });
      return member;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async enableMember(
    actor: AuthActor,
    workspaceId: string,
    targetUserId: string,
  ): Promise<MembershipSummary> {
    try {
      const member = await this.iam.enableMember(
        workspaceId,
        actor.userId,
        targetUserId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.enable",
        targetType: "membership",
        targetId: targetUserId,
        result: "success",
      });
      return member;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async listJoinRequests(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<JoinRequestSummary[]> {
    const rows = await this.iam.listJoinRequests(workspaceId, actor.userId);
    if (!rows) {
      throw new ForbiddenException(
        problem(403, "MEMBERSHIP_FORBIDDEN", "Join requests require a manager role"),
      );
    }
    return rows;
  }

  async createJoinRequest(
    actor: AuthActor,
    slug: string,
    body: CreateJoinRequestBody,
  ): Promise<JoinRequestSummary> {
    const workspace = await this.iam.getWorkspaceBySlug(slug);
    if (!workspace) {
      throw new NotFoundException(problem(404, "WORKSPACE_NOT_FOUND", "Workspace not found"));
    }
    try {
      const row = await this.iam.createJoinRequest({
        workspaceId: workspace.id,
        userId: actor.userId,
        message: body.message,
      });
      await this.audit.append({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        action: "membership.join_request.create",
        targetType: "join_request",
        targetId: row.id,
        result: "success",
      });
      return row;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async approveJoinRequest(
    actor: AuthActor,
    workspaceId: string,
    requestId: string,
    body: ApproveJoinRequestBody,
  ): Promise<JoinRequestSummary> {
    this.assertAssignableRole(body.role as MembershipRole);
    try {
      const row = await this.iam.approveJoinRequest({
        workspaceId,
        requestId,
        actorUserId: actor.userId,
        role: body.role as MembershipRole,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.join_request.approve",
        targetType: "join_request",
        targetId: requestId,
        result: "success",
        metadata: { role: body.role },
      });
      return row;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async rejectJoinRequest(
    actor: AuthActor,
    workspaceId: string,
    requestId: string,
  ): Promise<JoinRequestSummary> {
    try {
      const row = await this.iam.rejectJoinRequest({
        workspaceId,
        requestId,
        actorUserId: actor.userId,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.join_request.reject",
        targetType: "join_request",
        targetId: requestId,
        result: "success",
      });
      return row;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async withdrawJoinRequest(
    actor: AuthActor,
    requestId: string,
  ): Promise<JoinRequestSummary> {
    try {
      return await this.iam.withdrawJoinRequest(requestId, actor.userId);
    } catch (error) {
      mapStoreError(error);
    }
  }

  async proposeOwnershipTransfer(
    actor: AuthActor,
    workspaceId: string,
    body: ProposeOwnershipTransferBody,
  ): Promise<OwnershipTransferSummary> {
    try {
      const row = await this.iam.proposeOwnershipTransfer({
        workspaceId,
        fromUserId: actor.userId,
        toUserId: body.toUserId,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.ownership_transfer.propose",
        targetType: "ownership_transfer",
        targetId: row.id,
        result: "success",
        metadata: { toUserId: body.toUserId },
      });
      return row;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async listOwnershipTransfers(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<OwnershipTransferSummary[]> {
    const rows = await this.iam.listOwnershipTransfers(workspaceId, actor.userId);
    if (!rows) {
      throw new ForbiddenException(
        problem(403, "MEMBERSHIP_FORBIDDEN", "Must be an active member"),
      );
    }
    return rows;
  }

  async acceptOwnershipTransfer(
    actor: AuthActor,
    workspaceId: string,
    transferId: string,
  ): Promise<OwnershipTransferSummary> {
    try {
      const row = await this.iam.acceptOwnershipTransfer(
        workspaceId,
        transferId,
        actor.userId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.ownership_transfer.accept",
        targetType: "ownership_transfer",
        targetId: transferId,
        result: "success",
      });
      return row;
    } catch (error) {
      mapStoreError(error);
    }
  }

  async cancelOwnershipTransfer(
    actor: AuthActor,
    workspaceId: string,
    transferId: string,
  ): Promise<OwnershipTransferSummary> {
    try {
      const row = await this.iam.cancelOwnershipTransfer(
        workspaceId,
        transferId,
        actor.userId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "membership.ownership_transfer.cancel",
        targetType: "ownership_transfer",
        targetId: transferId,
        result: "success",
      });
      return row;
    } catch (error) {
      mapStoreError(error);
    }
  }
}
