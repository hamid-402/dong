import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { AccessAction, AuthActor, AccessGrant } from "@dang/contracts";
import {
  GRANTABLE_ACCESS_ACTIONS,
  LOCKED_ACCESS_ACTIONS,
  exportBuiltInPolicyAudit,
  isLockedAccessAction,
  resolveGrantLayers,
} from "@dang/contracts";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import {
  PERMISSIONS_STORE,
  type DeputyWindowRecord,
  type PermissionsStore,
} from "./permissions.types.js";

@Injectable()
export class PermissionsService {
  constructor(
    @Inject(PERMISSIONS_STORE) private readonly store: PermissionsStore,
    @Optional() @Inject(WorkspaceAccessService) private readonly access?: WorkspaceAccessService,
  ) {}

  persistence() {
    return this.store.persistence;
  }

  async getWorkspacePermissions(workspaceId: string, actor: AuthActor) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, ["owner", "admin", "finance"]);
    const [roleGrants, memberOverrides, deputyWindows] = await Promise.all([
      this.store.listRoleGrants(workspaceId),
      this.store.listMemberOverrides(workspaceId),
      this.store.listDeputyWindows(workspaceId),
    ]);
    return {
      lockedActions: [...LOCKED_ACCESS_ACTIONS],
      grantableActions: [...GRANTABLE_ACCESS_ACTIONS],
      roleGrants,
      memberOverrides,
      deputyWindows: deputyWindows.map((w) => this.toWindowDto(w)),
    };
  }

  async putRoleGrants(
    workspaceId: string,
    role: string,
    grants: AccessGrant[],
    actor: AuthActor,
  ) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, ["owner"]);
    this.assertGrants(grants);
    return this.store.replaceRoleGrants(workspaceId, role, grants, actor.userId);
  }

  async putMemberOverrides(
    workspaceId: string,
    userId: string,
    grants: AccessGrant[],
    actor: AuthActor,
  ) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, ["owner"]);
    this.assertGrants(grants);
    return this.store.replaceMemberOverrides(workspaceId, userId, grants, actor.userId);
  }

  async dryRun(
    workspaceId: string,
    actor: AuthActor,
    body: { userId: string; action: string; amountMinor?: string },
  ) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, [
      "owner",
      "admin",
      "finance",
      "auditor",
    ]);
    const action = body.action.trim() as AccessAction;
    const resource =
      body.amountMinor?.trim() && /^\d+$/.test(body.amountMinor.trim())
        ? { amountMinor: body.amountMinor.trim() }
        : undefined;
    if (!this.access) {
      return {
        allowed: false,
        reason: "WorkspaceAccessService unavailable",
        action,
      };
    }
    return this.access.previewAccess(workspaceId, body.userId.trim(), action, resource);
  }

  async effectiveForUser(workspaceId: string, userId: string, actor: AuthActor) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, [
      "owner",
      "admin",
      "finance",
      "auditor",
    ]);
    const role = await this.access?.requireMemberRole(workspaceId, userId);
    const [roleGrants, memberOverrides, deputy] = await Promise.all([
      this.store.listRoleGrants(workspaceId, role),
      this.store.listMemberOverrides(workspaceId, userId),
      this.store.findActiveDeputyWindow(workspaceId, userId),
    ]);
    const decisions = GRANTABLE_ACCESS_ACTIONS.map((action) => {
      const grant = resolveGrantLayers({
        action,
        roleGrants,
        memberOverrides,
      });
      return {
        action,
        grant,
        deputyActive: Boolean(deputy),
      };
    });
    return { role, deputyActive: Boolean(deputy), decisions };
  }

  async listDeputyWindows(workspaceId: string, actor: AuthActor) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, ["owner", "admin", "finance"]);
    const rows = await this.store.listDeputyWindows(workspaceId);
    return rows.map((w) => this.toWindowDto(w));
  }

  /**
   * Active built-in Policy DSL registry + notes for the caller's role.
   * Honest: sourced only from BUILT_IN_POLICIES — does not invent workspace grants.
   */
  async getPolicyAudit(workspaceId: string, actor: AuthActor) {
    const role = await this.access?.requireAnyRole(workspaceId, actor.userId, [
      "owner",
      "admin",
      "auditor",
    ]);
    const audit = exportBuiltInPolicyAudit(role ?? "unknown");
    return {
      workspaceId,
      ...audit,
    };
  }

  async createDeputyWindow(
    workspaceId: string,
    body: {
      userId: string;
      startsAt: string;
      endsAt: string;
      reason: string;
      approvalCapMinor?: string;
    },
    actor: AuthActor,
  ) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, ["owner", "finance"]);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (!(endsAt > startsAt)) {
      throw new BadRequestException({
        title: "Invalid range",
        status: 400,
        detail: "پایان بازه باید بعد از شروع باشد",
      });
    }
    const row = await this.store.createDeputyWindow({
      workspaceId,
      userId: body.userId,
      startsAt,
      endsAt,
      reason: body.reason?.trim() || "",
      approvalCapMinor: body.approvalCapMinor ?? null,
      createdByUserId: actor.userId,
    });
    return this.toWindowDto(row);
  }

  async revokeDeputyWindow(workspaceId: string, windowId: string, actor: AuthActor) {
    await this.access?.requireAnyRole(workspaceId, actor.userId, ["owner", "finance"]);
    const row = await this.store.revokeDeputyWindow(windowId, workspaceId);
    if (!row) throw new NotFoundException({ title: "Not found", status: 404 });
    return this.toWindowDto(row);
  }

  private assertGrants(grants: AccessGrant[]) {
    for (const g of grants) {
      if (isLockedAccessAction(g.action)) {
        throw new ForbiddenException({
          title: "Locked action",
          status: 403,
          detail: `اقدام ${g.action} قابل واگذاری نیست`,
          code: "DENY_LOCKED",
        });
      }
      if (g.effect !== "allow" && g.effect !== "deny") {
        throw new BadRequestException({ title: "Invalid effect", status: 400 });
      }
    }
  }

  private toWindowDto(w: DeputyWindowRecord) {
    return {
      id: w.id,
      workspaceId: w.workspaceId,
      userId: w.userId,
      startsAt: w.startsAt.toISOString(),
      endsAt: w.endsAt.toISOString(),
      reason: w.reason,
      approvalCapMinor: w.approvalCapMinor ?? undefined,
      createdByUserId: w.createdByUserId,
      createdAt: w.createdAt.toISOString(),
      revokedAt: w.revokedAt?.toISOString(),
      active: !w.revokedAt && w.startsAt <= new Date() && w.endsAt >= new Date(),
    };
  }
}
