import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AuthActor,
  CreateSettlementClaimRequest,
  MembershipRole,
  SettlementSummary,
} from "@dang/contracts";
import { isFinanceManagerRole, isReadOnlyRole } from "@dang/contracts";
import { MfaService } from "../auth/mfa.service.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  SETTLEMENT_STORE,
  toSettlementSummary,
  type SettlementStore,
  type StoredSettlement,
} from "./settlement.types.js";

@Injectable()
export class SettlementsService {
  constructor(
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  async createClaim(
    actor: AuthActor,
    workspaceId: string,
    body: CreateSettlementClaimRequest,
  ): Promise<SettlementSummary> {
    const role = await this.requireMemberRole(workspaceId, actor.userId);
    if (isReadOnlyRole(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "نقش ناظر فقط خواندنی است",
        status: 403,
        detail: "Auditor cannot create settlement claims",
      });
    }

    const payload: CreateSettlementClaimRequest = {
      ...body,
      workspaceId,
    };

    try {
      return await this.idempotency.run(
        `settlement.claim:${workspaceId}`,
        actor.userId,
        body.idempotencyKey,
        async () => {
          const created = await this.settlements.createClaim(actor.userId, payload);
          await this.audit.append({
            workspaceId,
            actorUserId: actor.userId,
            action: "settlement.claim.create",
            targetType: "settlement",
            targetId: created.id,
            result: "success",
            metadata: {
              amountMinor: created.amount.amountMinor,
              fromUserId: created.fromUserId,
              toUserId: created.toUserId,
            },
          });
          return toSettlementSummary(created);
        },
      );
    } catch (error: unknown) {
      this.rethrowValidation(error);
    }
  }

  async confirm(
    actor: AuthActor,
    workspaceId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    const role = await this.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.requireSettlement(workspaceId, settlementId, actor.userId);
    this.assertPartyAction(actor.userId, existing, role, "confirm");
    if (isFinanceManagerRole(role)) {
      await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    }

    try {
      const confirmed = await this.settlements.confirm(
        workspaceId,
        settlementId,
        actor.userId,
      );
      const summary = toSettlementSummary(confirmed);
      const journal = await this.ledger.postSettlement(actor.userId, summary);
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "settlement.claim.confirm",
        targetType: "settlement",
        targetId: confirmed.id,
        result: "success",
        metadata: {
          amountMinor: confirmed.amount.amountMinor,
          journalEntryId: journal.id,
          ledger: this.ledger.persistence === "postgres" ? "postgres_journal" : "memory_journal",
          financeOverride: isFinanceManagerRole(role) && actor.userId !== existing.toUserId,
        },
      });
      await this.notifications.notifySettlementConfirmed(
        workspaceId,
        actor.userId,
        confirmed.fromUserId,
        confirmed.toUserId,
        confirmed.amount.amountMinor,
      );
      return summary;
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async dispute(
    actor: AuthActor,
    workspaceId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    const role = await this.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.requireSettlement(workspaceId, settlementId, actor.userId);
    this.assertPartyAction(actor.userId, existing, role, "dispute");
    try {
      const disputed = await this.settlements.dispute(
        workspaceId,
        settlementId,
        actor.userId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "settlement.claim.dispute",
        targetType: "settlement",
        targetId: disputed.id,
        result: "success",
      });
      return toSettlementSummary(disputed);
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async cancel(
    actor: AuthActor,
    workspaceId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    const role = await this.requireMemberRole(workspaceId, actor.userId);
    const existing = await this.requireSettlement(workspaceId, settlementId, actor.userId);
    this.assertPartyAction(actor.userId, existing, role, "cancel");
    try {
      const cancelled = await this.settlements.cancel(
        workspaceId,
        settlementId,
        actor.userId,
      );
      await this.audit.append({
        workspaceId,
        actorUserId: actor.userId,
        action: "settlement.claim.cancel",
        targetType: "settlement",
        targetId: cancelled.id,
        result: "success",
      });
      return toSettlementSummary(cancelled);
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async list(actor: AuthActor, workspaceId: string): Promise<SettlementSummary[]> {
    await this.requireMemberRole(workspaceId, actor.userId);
    return this.settlements.listForWorkspace(workspaceId, actor.userId);
  }

  private async requireSettlement(
    workspaceId: string,
    settlementId: string,
    userId: string,
  ): Promise<StoredSettlement> {
    const existing = await this.settlements.get(workspaceId, settlementId, userId);
    if (!existing) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Settlement not found",
        status: 404,
      });
    }
    return existing;
  }

  /**
   * confirm → فقط طلبکار (to) یا مدیر مالی
   * dispute → هر یک از طرفین یا مدیر مالی
   * cancel → بدهکار/ایجادکننده یا مدیر مالی
   */
  private assertPartyAction(
    actorUserId: string,
    settlement: StoredSettlement,
    role: MembershipRole,
    action: "confirm" | "dispute" | "cancel",
  ): void {
    if (isFinanceManagerRole(role)) return;
    const allowed =
      action === "confirm"
        ? actorUserId === settlement.toUserId
        : action === "dispute"
          ? actorUserId === settlement.toUserId || actorUserId === settlement.fromUserId
          : actorUserId === settlement.fromUserId ||
            actorUserId === settlement.createdByUserId;
    if (!allowed) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "اجازهٔ این عملیات روی تسویه را ندارید",
        status: 403,
      });
    }
  }

  private async requireMemberRole(
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
      });
    }
    return me.role;
  }

  private async requireMember(workspaceId: string, userId: string): Promise<void> {
    await this.requireMemberRole(workspaceId, userId);
  }

  private rethrowLifecycle(error: unknown): never {
    if (error instanceof Error && error.message === "SETTLEMENT_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Settlement not found",
        status: 404,
      });
    }
    if (error instanceof Error && error.message === "SETTLEMENT_FORBIDDEN") {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "اجازهٔ این عملیات روی تسویه را ندارید",
        status: 403,
      });
    }
    this.rethrowValidation(error);
  }

  private rethrowValidation(error: unknown): never {
    if (error instanceof Error) {
      const map: Record<string, string> = {
        SETTLEMENT_CURRENCY: "Only IRR is supported",
        SETTLEMENT_AMOUNT: "Amount must be a positive integer minor unit",
        SETTLEMENT_PARTIES: "fromUserId and toUserId are required",
        SETTLEMENT_SAME_PARTY: "fromUserId and toUserId must differ",
        SETTLEMENT_IDEMPOTENCY: "Idempotency key is required",
        SETTLEMENT_LINK: "paymentLinkUrl must be a valid http(s) URL",
        SETTLEMENT_STATUS: "Invalid settlement status transition",
      };
      const detail = map[error.message];
      if (detail) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Invalid settlement",
          status: 400,
          detail,
        });
      }
    }
    throw error;
  }
}
