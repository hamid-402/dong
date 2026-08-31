import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateInviteRequest,
  CreateInviteResponse,
  InviteSummary,
  MembershipRole,
  WorkspaceSummary,
} from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { MemoryAuditStore } from "../audit/memory-audit.store.js";

const ASSIGNABLE_ROLES: MembershipRole[] = [
  "admin",
  "finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
];

@Injectable()
export class InvitesService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
  ) {}

  async create(
    actor: AuthActor,
    workspaceId: string,
    body: CreateInviteRequest,
  ): Promise<CreateInviteResponse> {
    if (!ASSIGNABLE_ROLES.includes(body.role) && body.role !== "owner") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid invite role",
        status: 400,
      });
    }
    if (body.role === "owner") {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Cannot invite as owner",
        status: 400,
        detail: "Transfer ownership is a separate flow.",
      });
    }

    try {
      const invite = await this.iam.createInvite({
        workspaceId,
        actorUserId: actor.userId,
        role: body.role,
        invitedSubject: body.invitedSubject,
        expiresInHours: body.expiresInHours,
      });
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "invite.create",
        targetType: "invite",
        targetId: invite.id,
        result: "success",
        metadata: { role: invite.role },
      });
      return invite;
    } catch (error: unknown) {
      this.rethrowInviteError(error);
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<InviteSummary[]> {
    const invites = await this.iam.listInvites(workspaceId, actor.userId);
    if (!invites) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    return invites;
  }

  async accept(actor: AuthActor, token: string): Promise<WorkspaceSummary> {
    if (!token?.includes(".")) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid invite token",
        status: 400,
      });
    }

    try {
      const workspace = await this.iam.acceptInvite(token, actor);
      if (this.audit instanceof MemoryAuditStore) {
        this.audit.grantReader(workspace.id, actor.userId);
      }
      await this.audit.append({
        workspaceId: workspace.id,
        actorUserId: actor.userId,
        action: "invite.accept",
        targetType: "workspace",
        targetId: workspace.id,
        result: "success",
      });
      return workspace;
    } catch (error: unknown) {
      this.rethrowInviteError(error);
    }
  }

  private rethrowInviteError(error: unknown): never {
    if (error instanceof Error) {
      switch (error.message) {
        case "INVITE_FORBIDDEN":
          throw new ForbiddenException({
            type: "https://dang.local/problems/forbidden",
            title: "Invite not allowed",
            status: 403,
          });
        case "INVITE_INVALID":
          throw new NotFoundException({
            type: "https://dang.local/problems/not-found",
            title: "Invite not found",
            status: 404,
          });
        case "INVITE_EXPIRED":
          throw new GoneException({
            type: "https://dang.local/problems/gone",
            title: "Invite expired",
            status: 410,
          });
        case "INVITE_ALREADY_USED":
          throw new GoneException({
            type: "https://dang.local/problems/gone",
            title: "Invite already used",
            status: 410,
          });
      }
    }
    throw error;
  }
}
