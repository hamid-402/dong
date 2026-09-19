import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import {
  DEFAULT_APPROVAL_TIERS,
  evaluateMakerChecker,
  evaluateTierApproval,
  readProductFeatureFlags,
  resolveApprovalTier,
  type ApprovalTier,
  type TierApprovalEvaluation,
} from "@dang/contracts";
import {
  EXPENSE_POLICY_STORE,
  type ExpensePolicyStore,
} from "../expense-policy/expense-policy.types.js";
import {
  SECURITY_EVENT_RECORDER,
  type SecurityEventRecorder,
} from "../security-events/security-events.types.js";
import {
  APPROVAL_DECISION_STORE,
  type ApprovalDecisionStore,
} from "./approval-decision.types.js";
import { MemoryApprovalDecisionStore } from "./memory-approval-decision.store.js";

export type TierGateOutcome =
  | { outcome: "bypass" }
  | { outcome: "finalize"; evaluation: TierApprovalEvaluation }
  | { outcome: "pending"; evaluation: TierApprovalEvaluation }
  | { outcome: "rejected"; evaluation: TierApprovalEvaluation };

/**
 * R10-25 — four-eyes gate for high-value financial mutations.
 * Phase 2.3 — additive multi-level approval tiers with persisted decisions.
 * Threshold: workspace expense policy when available, else MAKER_CHECKER_THRESHOLD_MINOR.
 */
@Injectable()
export class MakerCheckerService {
  private readonly decisions: ApprovalDecisionStore;

  constructor(
    @Optional()
    @Inject(EXPENSE_POLICY_STORE)
    private readonly policies?: ExpensePolicyStore,
    // Token, not the class — see the access service: the bare type annotation
    // left this undefined, so four-eyes denials were never recorded.
    @Optional()
    @Inject(SECURITY_EVENT_RECORDER)
    private readonly securityEvents?: SecurityEventRecorder,
    @Optional()
    @Inject(APPROVAL_DECISION_STORE)
    decisionsStore?: ApprovalDecisionStore,
  ) {
    this.decisions = decisionsStore ?? new MemoryApprovalDecisionStore();
  }

  enabled(): boolean {
    return readProductFeatureFlags(process.env).makerChecker;
  }

  /** Honest persistence of the approval-decision store (capabilities). */
  decisionsPersistence(): "memory" | "postgres" {
    return this.decisions.persistence;
  }

  async resolveThresholdMinor(
    workspaceId: string,
    actorUserId: string,
  ): Promise<string | null> {
    if (this.policies && readProductFeatureFlags(process.env).expensePolicy) {
      try {
        const policy = await this.policies.get(workspaceId, actorUserId);
        if (policy.approvalThresholdMinor?.trim()) {
          return policy.approvalThresholdMinor.trim();
        }
      } catch {
        /* fall through to env */
      }
    }
    const fromEnv = process.env.MAKER_CHECKER_THRESHOLD_MINOR?.trim();
    return fromEnv || null;
  }

  /** Workspace tiers when configured; else DEFAULT_APPROVAL_TIERS (G09 #31). */
  async resolveApprovalTiersForWorkspace(
    workspaceId: string,
    actorUserId: string,
  ): Promise<readonly ApprovalTier[]> {
    if (this.policies && readProductFeatureFlags(process.env).expensePolicy) {
      try {
        const policy = await this.policies.get(workspaceId, actorUserId);
        if (policy.approvalTiers?.length) {
          return policy.approvalTiers;
        }
      } catch {
        /* fall through */
      }
    }
    return DEFAULT_APPROVAL_TIERS;
  }

  /** Resolve amount band (DEFAULT_APPROVAL_TIERS unless overridden). */
  resolveTier(
    amountMinor: string,
    tiers?: readonly ApprovalTier[],
  ): ApprovalTier {
    return resolveApprovalTier(amountMinor, tiers);
  }

  /**
   * Progress for approval-queue / UI: distinct approved decisions vs tier requirement.
   */
  async approvalProgress(input: {
    workspaceId: string;
    requestType: string;
    requestId: string;
    amountMinor: string;
    actorUserId?: string;
    tiers?: readonly ApprovalTier[];
  }): Promise<{
    approvalsHave: number;
    approvalsNeeded: number;
    tier: ApprovalTier;
  }> {
    const tier = this.resolveTier(input.amountMinor, input.tiers);
    const prior = await this.decisions.listForRequest(
      input.workspaceId,
      input.requestType,
      input.requestId,
      input.actorUserId,
    );
    const approvalsHave = new Set(
      prior
        .filter((r) => r.decision === "approved")
        .map((r) => r.approverUserId.trim())
        .filter(Boolean),
    ).size;
    return {
      approvalsHave,
      approvalsNeeded: Math.max(1, tier.requiredApprovals),
      tier,
    };
  }

  /**
   * Hot-path gate after access check + assertFourEyes floor.
   * - bypass: single-approver band where maker may self-approve (do not call tiers)
   * - finalize: enough distinct approvals — caller mutates
   * - pending / rejected: do not finalize; return honest state to client
   */
  async applyTierGate(input: {
    workspaceId: string;
    requestType: string;
    requestId: string;
    amountMinor: string;
    makerUserId: string;
    approverUserId: string;
    approverRoles: readonly string[];
    decision?: "approved" | "rejected";
    tiers?: readonly ApprovalTier[];
  }): Promise<TierGateOutcome> {
    if (!this.enabled()) return { outcome: "bypass" };
    const decision = input.decision ?? "approved";
    const tier = this.resolveTier(input.amountMinor, input.tiers);
    if (
      decision === "approved" &&
      tier.requiredApprovals <= 1 &&
      input.makerUserId.trim() === input.approverUserId.trim()
    ) {
      return { outcome: "bypass" };
    }
    const evaluation = await this.recordTierDecision({
      ...input,
      decision,
    });
    if (evaluation.status === "complete") {
      return { outcome: "finalize", evaluation };
    }
    if (evaluation.status === "rejected") {
      return { outcome: "rejected", evaluation };
    }
    return { outcome: "pending", evaluation };
  }

  /** Attach tier progress fields onto an existing summary (pending/denied responses). */
  withTierProgress<T extends object>(
    summary: T,
    evaluation: TierApprovalEvaluation,
  ): T & {
    approvalsHave: number;
    approvalsNeeded: number;
    tierApprovalStatus: TierApprovalEvaluation["status"];
  } {
    return {
      ...summary,
      approvalsHave: evaluation.approvalsCount,
      approvalsNeeded: evaluation.requiredApprovals,
      tierApprovalStatus: evaluation.status,
    };
  }

  /**
   * Record one approval/rejection toward the tier matrix.
   * Returns pending until requiredApprovals distinct approvers; does not replace assertFourEyes.
   */
  async recordTierDecision(input: {
    workspaceId: string;
    requestType: string;
    requestId: string;
    amountMinor: string;
    makerUserId: string;
    approverUserId: string;
    approverRoles: readonly string[];
    decision: "approved" | "rejected";
    tiers?: readonly ApprovalTier[];
  }): Promise<TierApprovalEvaluation> {
    const prior = await this.decisions.listForRequest(
      input.workspaceId,
      input.requestType,
      input.requestId,
      input.approverUserId,
    );
    const priorApprovedUserIds = prior
      .filter((r) => r.decision === "approved")
      .map((r) => r.approverUserId);

    const evaluation = evaluateTierApproval({
      amountMinor: input.amountMinor,
      makerUserId: input.makerUserId,
      approverUserId: input.approverUserId,
      approverRoles: input.approverRoles,
      decision: input.decision,
      priorApprovedUserIds,
      tiers: input.tiers,
    });

    if (!evaluation.allowed) {
      this.securityEvents?.emit("access.maker_checker_denied", {
        workspaceId: input.workspaceId,
        actorUserId: input.approverUserId,
        targetType: "approval_tier",
        targetId: input.requestId,
        reason: evaluation.code,
        attrs: {
          requestType: input.requestType,
          requiredApprovals: evaluation.requiredApprovals,
          minAmountMinor: evaluation.tier.minAmountMinor,
        },
      });
      throw new ForbiddenException({
        type: "https://dang.local/problems/maker-checker",
        title: "Maker-checker required",
        status: 403,
        detail:
          evaluation.code === "ROLE_REQUIRED"
            ? "تأیید این مبلغ نیازمند نقش owner یا finance است"
            : "برای تأیید چندسطحی، تأییدکننده باید غیر از ایجادکننده باشد (چهارچشم)",
        code: evaluation.code,
      });
    }

    if (evaluation.code !== "ALREADY_DECIDED") {
      await this.decisions.append({
        workspaceId: input.workspaceId,
        requestType: input.requestType,
        requestId: input.requestId,
        amountMinor: input.amountMinor,
        approverUserId: input.approverUserId,
        decision: input.decision,
        approverRole: input.approverRoles[0] ?? null,
      });
    }

    return evaluation;
  }

  async assertFourEyes(input: {
    workspaceId: string;
    actorUserId: string;
    makerUserId: string;
    amountMinor: string;
    actionLabel: string;
  }): Promise<void> {
    if (!this.enabled()) return;
    const thresholdMinor = await this.resolveThresholdMinor(
      input.workspaceId,
      input.actorUserId,
    );
    const result = evaluateMakerChecker({
      amountMinor: input.amountMinor,
      thresholdMinor,
      makerUserId: input.makerUserId,
      checkerUserId: input.actorUserId,
    });
    if (result.allowed) return;
    this.securityEvents?.emit("access.maker_checker_denied", {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      targetType: "maker_checker",
      reason: result.code,
      attrs: {
        action: input.actionLabel,
        makerUserId: input.makerUserId,
      },
    });
    throw new ForbiddenException({
      type: "https://dang.local/problems/maker-checker",
      title: "Maker-checker required",
      status: 403,
      detail: `برای ${input.actionLabel} بالای سقف، تأییدکننده باید غیر از ایجادکننده باشد (چهارچشم)`,
      code: result.code,
    });
  }
}
