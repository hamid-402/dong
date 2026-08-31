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
  SettlementSummary,
} from "@dang/contracts";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  SETTLEMENT_STORE,
  toSettlementSummary,
  type SettlementStore,
} from "./settlement.types.js";

@Injectable()
export class SettlementsService {
  constructor(
    @Inject(SETTLEMENT_STORE) private readonly settlements: SettlementStore,
    @Inject(LEDGER_STORE) private readonly ledger: LedgerStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
  ) {}

  async createClaim(
    actor: AuthActor,
    workspaceId: string,
    body: CreateSettlementClaimRequest,
  ): Promise<SettlementSummary> {
    await this.requireMember(workspaceId, actor.userId);

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
    await this.requireMember(workspaceId, actor.userId);

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
        },
      });
      await this.notifications.notifySettlementConfirmed(
        workspaceId,
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
    await this.requireMember(workspaceId, actor.userId);
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
    await this.requireMember(workspaceId, actor.userId);
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
    await this.requireMember(workspaceId, actor.userId);
    return this.settlements.listForWorkspace(workspaceId, actor.userId);
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

  private rethrowLifecycle(error: unknown): never {
    if (error instanceof Error && error.message === "SETTLEMENT_NOT_FOUND") {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Settlement not found",
        status: 404,
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
