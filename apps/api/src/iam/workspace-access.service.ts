import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  forwardRef,
} from "@nestjs/common";
import {
  ACCESS_POLICY_VERSION,
  buildPolicyContextAttrs,
  evaluateAccessPolicy,
  evaluateBuiltInPoliciesForAction,
  isFinanceManagerRole,
  isReadOnlyRole,
  policyActionsForAccessAction,
  resolveGrantLayers,
  roleInSet,
  type AccessAction,
  type AccessDecision,
  type AccessResourceAttrs,
  type MembershipRole,
} from "@dang/contracts";
import {
  SECURITY_EVENT_RECORDER,
  type SecurityEventRecorder,
} from "../security-events/security-events.types.js";
import {
  PERMISSIONS_STORE,
  type PermissionsStore,
} from "../permissions/permissions.types.js";
import { PlatformService } from "../platform/platform.service.js";
import { IAM_STORE, type IamStore } from "./iam.types.js";

@Injectable()
export class WorkspaceAccessService {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    // Token, not the class: the recorder imports this service, so naming the
    // class here would be a runtime cycle — and a bare type annotation left the
    // dependency silently undefined, which is why denials went unlogged.
    @Optional()
    @Inject(SECURITY_EVENT_RECORDER)
    private readonly securityEvents?: SecurityEventRecorder,
    @Optional() @Inject(PERMISSIONS_STORE) private readonly permissions?: PermissionsStore,
    @Optional()
    @Inject(forwardRef(() => PlatformService))
    private readonly platform?: PlatformService,
  ) {}

  async requireMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, userId);
    if (membership) return;
    if (await this.platform?.hasActiveBreakGlass(userId, workspaceId)) return;
    throw new ForbiddenException({
      type: "https://dang.local/problems/forbidden",
      title: "Not a workspace member",
      status: 403,
      detail: "عضویت فضای کاری لازم است",
    });
  }

  async requireMemberRole(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipRole> {
    const members = (await this.iam.listMembers(workspaceId, userId)) ?? [];
    const me = members.find((m) => m.userId === userId);
    if (me) return me.role;
    if (await this.platform?.hasActiveBreakGlass(userId, workspaceId)) {
      return "auditor";
    }
    throw new ForbiddenException({
      type: "https://dang.local/problems/forbidden",
      title: "Not a workspace member",
      status: 403,
      detail: "عضویت فضای کاری لازم است",
    });
  }

  /**
   * Member must hold at least one of `allowed` (R10-05 policy registry).
   * Active deputy finance windows count as `finance` when that role is allowed.
   */
  async requireAnyRole(
    workspaceId: string,
    userId: string,
    allowed: readonly string[],
    detail = "نقش کافی برای این عمل ندارید",
  ): Promise<MembershipRole> {
    const role = await this.requireMemberRole(workspaceId, userId);
    if (roleInSet(role, allowed)) {
      return role;
    }
    const needsFinance =
      allowed.includes("finance") ||
      allowed.some((r) => isFinanceManagerRole(r));
    if (needsFinance && (await this.hasActiveDeputyFinance(workspaceId, userId))) {
      return role;
    }
    throw new ForbiddenException({
      type: "https://dang.local/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail,
    });
  }

  async requireFinanceManager(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipRole> {
    const { role } = await this.requireAccess(
      workspaceId,
      userId,
      "finance.manage",
    );
    return role;
  }

  /**
   * Mutable workspace member (denies guest/auditor) via central policy.
   */
  async requireMutableMember(
    workspaceId: string,
    userId: string,
  ): Promise<MembershipRole> {
    const { role } = await this.requireAccess(
      workspaceId,
      userId,
      "workspace.mutate",
    );
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

  /**
   * R10-05 / S11-04 — grant layers then role + resource ABAC, then Policy DSL
   * built-ins when attrs are available; throw on deny.
   */
  async requireAccess(
    workspaceId: string,
    userId: string,
    action: AccessAction,
    resource?: AccessResourceAttrs,
  ): Promise<{ role: MembershipRole; decision: AccessDecision }> {
    const role = await this.requireMemberRole(workspaceId, userId);
    const effectiveRole = await this.effectiveRoleForPolicy(workspaceId, userId, role);

    if (this.permissions) {
      const [roleGrants, memberOverrides] = await Promise.all([
        this.permissions.listRoleGrants(workspaceId, effectiveRole),
        this.permissions.listMemberOverrides(workspaceId, userId),
      ]);
      const grant = resolveGrantLayers({
        action,
        roleGrants,
        memberOverrides,
      });
      if (grant) {
        if (!grant.allowed) {
          this.deny(workspaceId, userId, action, {
            allowed: false,
            code: "DENY_ROLE",
            reason: `Grant ${grant.source} denied ${action}`,
            policyVersion: ACCESS_POLICY_VERSION,
            action,
          });
        }
        this.assertBuiltInPolicies(workspaceId, userId, action, effectiveRole, resource);
        await this.assertDeputyApprovalCap(workspaceId, userId, role, action, resource);
        return {
          role: effectiveRole,
          decision: {
            allowed: true,
            code: "ALLOW",
            reason: `Grant ${grant.source} allowed ${action}`,
            policyVersion: ACCESS_POLICY_VERSION,
            action,
          },
        };
      }
    }

    const decision = evaluateAccessPolicy({
      role: effectiveRole,
      action,
      subjectUserId: userId,
      resource,
    });
    if (!decision.allowed) {
      this.deny(workspaceId, userId, action, decision);
    }
    this.assertBuiltInPolicies(workspaceId, userId, action, effectiveRole, resource);
    await this.assertDeputyApprovalCap(workspaceId, userId, role, action, resource);
    return { role: effectiveRole, decision };
  }

  evaluate(
    role: MembershipRole,
    action: AccessAction,
    subjectUserId: string,
    resource?: AccessResourceAttrs,
  ): AccessDecision {
    return evaluateAccessPolicy({
      role,
      action,
      subjectUserId,
      resource,
    });
  }

  /** Non-throwing access preview for permissions dry-run (G09 #51). */
  async previewAccess(
    workspaceId: string,
    userId: string,
    action: AccessAction,
    resource?: AccessResourceAttrs,
  ): Promise<{
    allowed: boolean;
    reason: string;
    code?: AccessDecision["code"];
    matched?: { source: string; effect: "allow" | "deny" };
    policyVersion: typeof ACCESS_POLICY_VERSION;
    action: AccessAction;
  }> {
    try {
      const role = await this.requireMemberRole(workspaceId, userId);
      const effectiveRole = await this.effectiveRoleForPolicy(workspaceId, userId, role);

      if (this.permissions) {
        const [roleGrants, memberOverrides] = await Promise.all([
          this.permissions.listRoleGrants(workspaceId, effectiveRole),
          this.permissions.listMemberOverrides(workspaceId, userId),
        ]);
        const grant = resolveGrantLayers({
          action,
          roleGrants,
          memberOverrides,
        });
        if (grant) {
          if (!grant.allowed) {
            return {
              allowed: false,
              reason: `Grant ${grant.source} denied ${action}`,
              code: "DENY_ROLE",
              matched: { source: grant.source, effect: "deny" },
              policyVersion: ACCESS_POLICY_VERSION,
              action,
            };
          }
          const dsl = this.evaluateBuiltInPolicies(
            effectiveRole,
            userId,
            action,
            resource,
          );
          if (dsl) {
            return {
              allowed: false,
              reason: dsl.reason,
              code: "DENY_ATTRIBUTE",
              policyVersion: ACCESS_POLICY_VERSION,
              action,
            };
          }
          const capDeny = await this.previewDeputyCapDeny(workspaceId, userId, role, resource);
          if (capDeny) {
            return {
              allowed: false,
              reason: capDeny,
              code: "DENY_ATTRIBUTE",
              policyVersion: ACCESS_POLICY_VERSION,
              action,
            };
          }
          return {
            allowed: true,
            reason: `Grant ${grant.source} allowed ${action}`,
            code: "ALLOW",
            matched: { source: grant.source, effect: "allow" },
            policyVersion: ACCESS_POLICY_VERSION,
            action,
          };
        }
      }

      const decision = evaluateAccessPolicy({
        role: effectiveRole,
        action,
        subjectUserId: userId,
        resource,
      });
      if (!decision.allowed) {
        return {
          allowed: false,
          reason: decision.reason,
          code: decision.code,
          policyVersion: decision.policyVersion,
          action: decision.action,
        };
      }
      const dsl = this.evaluateBuiltInPolicies(
        effectiveRole,
        userId,
        action,
        resource,
      );
      if (dsl) {
        return {
          allowed: false,
          reason: dsl.reason,
          code: "DENY_ATTRIBUTE",
          policyVersion: ACCESS_POLICY_VERSION,
          action,
        };
      }
      const capDeny = await this.previewDeputyCapDeny(workspaceId, userId, role, resource);
      if (capDeny) {
        return {
          allowed: false,
          reason: capDeny,
          code: "DENY_ATTRIBUTE",
          policyVersion: ACCESS_POLICY_VERSION,
          action,
        };
      }
      return {
        allowed: true,
        reason: decision.reason,
        code: decision.code,
        policyVersion: decision.policyVersion,
        action: decision.action,
      };
    } catch (err: unknown) {
      const detail =
        err instanceof ForbiddenException
          ? (err.getResponse() as { detail?: string })?.detail
          : undefined;
      return {
        allowed: false,
        reason: detail ?? "عضویت یا دسترسی اولیه رد شد",
        code: "DENY_ROLE",
        policyVersion: ACCESS_POLICY_VERSION,
        action,
      };
    }
  }

  private evaluateBuiltInPolicies(
    role: MembershipRole,
    userId: string,
    action: AccessAction,
    resource?: AccessResourceAttrs,
  ): { reason: string } | null {
    const attrs = buildPolicyContextAttrs(role, userId, resource);
    for (const policyAction of policyActionsForAccessAction(action)) {
      const dsl = evaluateBuiltInPoliciesForAction({
        action: policyAction,
        attrs,
      });
      if (!dsl.allowed) {
        return { reason: dsl.reason };
      }
    }
    return null;
  }

  /**
   * Secondary matrix: BUILT_IN_POLICIES via evaluatePolicy when attrs available.
   */
  private assertBuiltInPolicies(
    workspaceId: string,
    userId: string,
    action: AccessAction,
    role: MembershipRole,
    resource?: AccessResourceAttrs,
  ): void {
    const dsl = this.evaluateBuiltInPolicies(role, userId, action, resource);
    if (dsl) {
      this.deny(workspaceId, userId, action, {
        allowed: false,
        code: "DENY_ATTRIBUTE",
        reason: dsl.reason,
        policyVersion: ACCESS_POLICY_VERSION,
        action,
      });
    }
  }

  private async hasActiveDeputyFinance(
    workspaceId: string,
    userId: string,
  ): Promise<boolean> {
    if (!this.permissions) return false;
    const window = await this.permissions.findActiveDeputyWindow(workspaceId, userId);
    return Boolean(window);
  }

  /**
   * R7 / RES-02 — when access is elevated via an active deputy window that sets
   * approvalCapMinor, deny if resource.amountMinor exceeds the cap.
   * Native finance managers are not capped by deputy windows.
   */
  private async assertDeputyApprovalCap(
    workspaceId: string,
    userId: string,
    baseRole: MembershipRole,
    action: AccessAction,
    resource?: AccessResourceAttrs,
  ): Promise<void> {
    const reason = await this.previewDeputyCapDeny(
      workspaceId,
      userId,
      baseRole,
      resource,
    );
    if (!reason) return;
    this.deny(workspaceId, userId, action, {
      allowed: false,
      code: "DENY_ATTRIBUTE",
      reason,
      policyVersion: ACCESS_POLICY_VERSION,
      action,
    });
  }

  private async previewDeputyCapDeny(
    workspaceId: string,
    userId: string,
    baseRole: MembershipRole,
    resource?: AccessResourceAttrs,
  ): Promise<string | null> {
    if (isFinanceManagerRole(baseRole)) return null;
    const amount = resource?.amountMinor?.trim();
    if (!amount || !this.permissions) return null;
    const window = await this.permissions.findActiveDeputyWindow(workspaceId, userId);
    const cap = window?.approvalCapMinor?.trim();
    if (!cap) return null;
    try {
      if (BigInt(amount) > BigInt(cap)) {
        return `سقف تأیید جانشین مالی (${cap}) برای مبلغ ${amount} کافی نیست`;
      }
    } catch {
      return "مبلغ یا سقف تأیید جانشین مالی نامعتبر است";
    }
    return null;
  }

  private async effectiveRoleForPolicy(
    workspaceId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<MembershipRole> {
    if (isFinanceManagerRole(role)) return role;
    if (role === "deputy_finance") {
      const active = await this.hasActiveDeputyFinance(workspaceId, userId);
      return active ? "finance" : role;
    }
    if (await this.hasActiveDeputyFinance(workspaceId, userId)) {
      return "finance";
    }
    return role;
  }

  private deny(
    workspaceId: string,
    userId: string,
    action: AccessAction,
    decision: AccessDecision,
  ): never {
    this.securityEvents?.emit("access.policy_denied", {
      workspaceId,
      actorUserId: userId,
      targetType: "access_policy",
      reason: decision.code,
      attrs: {
        action,
        policyVersion: decision.policyVersion,
      },
    });
    throw new ForbiddenException({
      type: "https://dang.local/problems/forbidden",
      title: "Access policy denied",
      status: 403,
      detail: decision.reason,
      code: decision.code,
      policyVersion: decision.policyVersion,
      action: decision.action,
    });
  }
}
