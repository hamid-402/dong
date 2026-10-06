import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type {
  AuthActor,
  ConfirmSettlementRequest,
  ConfirmSimplifySettlementClaimsRequest,
  ConfirmSimplifySettlementClaimsResponse,
  CreateSettlementClaimRequest,
  CreateSimplifySettlementClaimsRequest,
  CreateSimplifySettlementClaimsResponse,
  MembershipRole,
  PreviewSettlementEffectRequest,
  PreviewSettlementEffectResponse,
  SettlementSummary,
} from "@dang/contracts";
import {
  DEBT_SIMPLIFY_CLAIM_NOTE,
  isDebtSimplifyClaimNote,
  isFinanceManagerRole,
  isFundPartyId,
  isZeroSumBalances,
  evaluateSettlementAnomaly,
  previewBalancesAfterTransfers,
  readProductFeatureFlags,
  settlementSuggestionsSatisfyGoldenRules,
  suggestMinimalSettlements,
} from "@dang/contracts";
import { withTenantContext } from "@dang/db";
import { getRequestId, getTraceId, withSpan } from "@dang/observability";
import { MfaService } from "../auth/mfa.service.js";
import { AUDIT_STORE, type AuditStore } from "../audit/audit.types.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import { LEDGER_STORE, type LedgerStore } from "../ledger/ledger.types.js";
import { MakerCheckerService } from "../maker-checker/maker-checker.service.js";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  PAYMENT_OPS_STORE,
  type PaymentOpsStore,
} from "../payments/payment-ops.types.js";
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
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(AUDIT_STORE) private readonly audit: AuditStore,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(OutboxRelay) private readonly outboxRelay: OutboxRelay,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(MakerCheckerService) private readonly makerChecker: MakerCheckerService,
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Optional()
    @Inject(PAYMENT_OPS_STORE)
    private readonly paymentOps?: PaymentOpsStore,
  ) {}

  async createClaim(
    actor: AuthActor,
    workspaceId: string,
    body: CreateSettlementClaimRequest,
  ): Promise<SettlementSummary> {
    const { role } = await this.access.requireAccess(
      workspaceId,
      actor.userId,
      "settlement.claim",
      { amountMinor: body.amount.amountMinor },
    );
    await Promise.all([
      this.requireSettlementParty(workspaceId, body.fromUserId),
      this.requireSettlementParty(workspaceId, body.toUserId),
    ]);
    if (isFundPartyId(body.fromUserId) || body.fromUserId !== actor.userId) {
      if (!isFinanceManagerRole(role)) {
        throw new ForbiddenException({
          type: "https://dang.local/problems/forbidden",
          title: isFundPartyId(body.fromUserId)
            ? "تسویه از صندوق فقط برای مدیر مالی مجاز است"
            : "ثبت تسویه فقط از حساب خودتان مجاز است",
          status: 403,
        });
      }
      await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    }

    const anomaly = evaluateSettlementAnomaly({
      amountMinor: body.amount.amountMinor,
      fromUserId: body.fromUserId,
      toUserId: body.toUserId,
    });
    if (!anomaly.ok) {
      this.securityEvents.emit("fraud.settlement_anomaly", {
        workspaceId,
        actorUserId: actor.userId,
        targetType: "settlement",
        reason: anomaly.reasons.join(","),
        attrs: {
          amountMinor: body.amount.amountMinor,
        },
      });
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Settlement anomaly",
        status: 400,
        detail: "مبلغ یا طرفین تسویه نامعتبر است",
        reasons: anomaly.reasons,
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
          const counterpart =
            actor.userId === created.fromUserId
              ? created.toUserId
              : created.fromUserId;
          await this.notifications
            .notifySettlementClaimed(
              workspaceId,
              actor.userId,
              counterpart,
              created.amount.amountMinor,
            )
            .catch(() => undefined);
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
    evidence: ConfirmSettlementRequest = {},
  ): Promise<SettlementSummary> {
    const existing = await this.requireSettlement(workspaceId, settlementId, actor.userId);
    const { role } = await this.access.requireAccess(
      workspaceId,
      actor.userId,
      "settlement.confirm",
      { status: existing.status, amountMinor: existing.amount.amountMinor },
    );
    this.assertPartyAction(actor.userId, existing, role, "confirm");
    await this.assertSettlementEvidence(workspaceId, settlementId, evidence);
    if (isFinanceManagerRole(role)) {
      await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);
    }
    await this.makerChecker.assertFourEyes({
      workspaceId,
      actorUserId: actor.userId,
      makerUserId: existing.createdByUserId,
      amountMinor: existing.amount.amountMinor,
      actionLabel: "تأیید تسویه",
    });
    const tierGate = await this.makerChecker.applyTierGate({
      workspaceId,
      requestType: "settlement",
      requestId: settlementId,
      amountMinor: existing.amount.amountMinor,
      makerUserId: existing.createdByUserId ?? existing.fromUserId,
      approverUserId: actor.userId,
      approverRoles: [role],
      decision: "approved",
    });
    if (tierGate.outcome === "pending" || tierGate.outcome === "rejected") {
      return this.makerChecker.withTierProgress(
        toSettlementSummary(existing),
        tierGate.evaluation,
      );
    }

    try {
      const moneyDb =
        this.settlements.db &&
        this.ledger.db &&
        this.settlements.db === this.ledger.db &&
        (!this.outbox.db || this.outbox.db === this.settlements.db)
          ? this.settlements.db
          : undefined;

      let confirmed: StoredSettlement;
      let journalId: string;
      let ledgerKind: "postgres_journal" | "memory_journal";

      return await withSpan(
        "settlement.confirm",
        { workspaceId, settlementId },
        async () => {
      if (moneyDb) {
        const atomic = await withTenantContext(
          moneyDb,
          { workspaceId, userId: actor.userId },
          async (tx) => {
            const row = await this.settlements.confirm(
              workspaceId,
              settlementId,
              actor.userId,
              { tx },
            );
            const summary = toSettlementSummary(row);
            const journal = await withSpan(
              "ledger.postSettlement",
              { settlementId },
              () => this.ledger.postSettlement(actor.userId, summary, { tx }),
            );
            const corr = this.outboxRelay.correlation();
            const outboxRow = await this.outbox.insert(
              {
                workspaceId,
                aggregateType: "settlement",
                aggregateId: row.id,
                eventType: "settlement.confirmed",
                payload: {
                  settlementId: row.id,
                  fromUserId: row.fromUserId,
                  toUserId: row.toUserId,
                  amountMinor: row.amount.amountMinor,
                  actorUserId: actor.userId,
                  journalEntryId: journal.id,
                },
                requestId: corr.requestId,
                traceId: corr.traceId,
              },
              { tx },
            );
            return { row, summary, journal, outboxRow };
          },
        );
        confirmed = atomic.row;
        journalId = atomic.journal.id;
        ledgerKind = "postgres_journal";
        await this.audit.append({
          workspaceId,
          actorUserId: actor.userId,
          action: "settlement.claim.confirm",
          targetType: "settlement",
          targetId: confirmed.id,
          result: "success",
          requestId: getRequestId(),
          traceId: getTraceId(),
          metadata: {
            amountMinor: confirmed.amount.amountMinor,
            journalEntryId: journalId,
            ledger: ledgerKind,
            outboxId: atomic.outboxRow.id,
            financeOverride:
              isFinanceManagerRole(role) && actor.userId !== existing.toUserId,
          },
        });
        await this.outboxRelay.dispatch(atomic.outboxRow);
        return atomic.summary;
      }

      try {
        confirmed = await this.settlements.confirm(
          workspaceId,
          settlementId,
          actor.userId,
        );
        const summary = toSettlementSummary(confirmed);
        const journal = await withSpan("ledger.postSettlement", { settlementId }, () =>
          this.ledger.postSettlement(actor.userId, summary),
        );
        journalId = journal.id;
        ledgerKind = "memory_journal";
        const corr = this.outboxRelay.correlation();
        const outboxRow = await this.outbox.insert({
          workspaceId,
          aggregateType: "settlement",
          aggregateId: confirmed.id,
          eventType: "settlement.confirmed",
          payload: {
            settlementId: confirmed.id,
            fromUserId: confirmed.fromUserId,
            toUserId: confirmed.toUserId,
            amountMinor: confirmed.amount.amountMinor,
            actorUserId: actor.userId,
            journalEntryId: journalId,
          },
          requestId: corr.requestId,
          traceId: corr.traceId,
        });
        await this.audit.append({
          workspaceId,
          actorUserId: actor.userId,
          action: "settlement.claim.confirm",
          targetType: "settlement",
          targetId: confirmed.id,
          result: "success",
          requestId: getRequestId(),
          traceId: getTraceId(),
          metadata: {
            amountMinor: confirmed.amount.amountMinor,
            journalEntryId: journalId,
            ledger: ledgerKind,
            outboxId: outboxRow.id,
            financeOverride:
              isFinanceManagerRole(role) && actor.userId !== existing.toUserId,
          },
        });
        await this.outboxRelay.dispatch(outboxRow);
        return summary;
      } catch (error: unknown) {
        if (this.settlements.compensateStatus) {
          const after = await this.settlements.get(
            workspaceId,
            settlementId,
            actor.userId,
          );
          if (after?.status === "confirmed") {
            await this.settlements.compensateStatus(
              workspaceId,
              settlementId,
              "claimed",
            );
          }
        }
        throw error;
      }
        },
      );
    } catch (error: unknown) {
      this.rethrowLifecycle(error);
    }
  }

  async dispute(
    actor: AuthActor,
    workspaceId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    const existing = await this.requireSettlement(workspaceId, settlementId, actor.userId);
    const isParty =
      actor.userId === existing.toUserId || actor.userId === existing.fromUserId;
    const { role } = await this.access.requireAccess(
      workspaceId,
      actor.userId,
      "settlement.dispute",
      { isParty, status: existing.status },
    );
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
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
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
    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    const settlements = await this.settlements.listForWorkspace(workspaceId, actor.userId);
    if (isFinanceManagerRole(role)) return settlements;
    return settlements.filter(
      (s) => s.fromUserId === actor.userId || s.toUserId === actor.userId,
    );
  }

  /**
   * Materialize greedy simplify suggestions as claimed settlements (not confirmed).
   * Existing claim/confirm/dispute flows stay the source of truth for lifecycle.
   */
  async createSimplifyClaims(
    actor: AuthActor,
    workspaceId: string,
    body: CreateSimplifySettlementClaimsRequest,
  ): Promise<CreateSimplifySettlementClaimsResponse> {
    if (!readProductFeatureFlags(process.env).debtSimplifyApi) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Debt simplify API disabled",
        detail: "Set ENABLE_DEBT_SIMPLIFY_API=1 to enable simplify claim creation.",
        status: 403,
      });
    }

    const role = await this.access.requireMemberRole(workspaceId, actor.userId);
    if (!isFinanceManagerRole(role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "ساده‌سازی بدهی فقط برای مدیر مالی مجاز است",
        status: 403,
      });
    }
    await this.mfa.assertMfaEnrolledForFinanceAction(actor.userId);

    return this.idempotency.run(
      `settlement.simplify:${workspaceId}`,
      actor.userId,
      body.idempotencyKey,
      async () => {
        const lines = await this.ledger.balancesForWorkspace(
          workspaceId,
          actor.userId,
        );
        if (!isZeroSumBalances(lines)) {
          throw new BadRequestException({
            type: "https://dang.local/problems/validation",
            title: "Balances are not zero-sum",
            status: 400,
          });
        }
        const suggestions = suggestMinimalSettlements(lines);
        if (
          !settlementSuggestionsSatisfyGoldenRules(lines, suggestions)
        ) {
          throw new BadRequestException({
            type: "https://dang.local/problems/validation",
            title: "Simplify suggestions failed golden rules",
            status: 400,
          });
        }

        const open = await this.settlements.listForWorkspace(
          workspaceId,
          actor.userId,
        );
        const openKeys = new Set(
          open
            .filter((s) => s.status === "claimed" || s.status === "disputed")
            .map(
              (s) =>
                `${s.fromUserId}:${s.toUserId}:${s.amount.amountMinor}`,
            ),
        );

        const created: SettlementSummary[] = [];
        let skipped = 0;
        let index = 0;
        for (const suggestion of suggestions) {
          const key = `${suggestion.fromUserId}:${suggestion.toUserId}:${suggestion.amount.amountMinor}`;
          if (openKeys.has(key)) {
            skipped += 1;
            continue;
          }
          const claim = await this.createClaim(actor, workspaceId, {
            workspaceId,
            fromUserId: suggestion.fromUserId,
            toUserId: suggestion.toUserId,
            amount: suggestion.amount,
            note: DEBT_SIMPLIFY_CLAIM_NOTE,
            idempotencyKey: `${body.idempotencyKey}:${index}`,
          });
          created.push(claim);
          openKeys.add(key);
          index += 1;
        }

        await this.audit.append({
          workspaceId,
          actorUserId: actor.userId,
          action: "settlement.simplify.claims",
          targetType: "workspace",
          targetId: workspaceId,
          result: "success",
          metadata: {
            created: created.length,
            skipped,
            suggestionCount: suggestions.length,
          },
        });

        return { workspaceId, created, skipped };
      },
    );
  }

  /**
   * Confirm open debt-simplify claims the actor may confirm (creditor or finance).
   * Partial success is intentional — one four-eyes denial must not block others.
   */
  async confirmSimplifyClaims(
    actor: AuthActor,
    workspaceId: string,
    body: ConfirmSimplifySettlementClaimsRequest,
  ): Promise<ConfirmSimplifySettlementClaimsResponse> {
    if (!readProductFeatureFlags(process.env).debtSimplifyApi) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/feature-disabled",
        title: "Debt simplify API disabled",
        detail: "Set ENABLE_DEBT_SIMPLIFY_API=1 to enable simplify claim confirmation.",
        status: 403,
      });
    }

    await this.access.requireMemberRole(workspaceId, actor.userId);

    return this.idempotency.run(
      `settlement.simplify.confirm:${workspaceId}`,
      actor.userId,
      body.idempotencyKey,
      async () => {
        const listed = await this.settlements.listForWorkspace(
          workspaceId,
          actor.userId,
        );
        const idFilter =
          body.settlementIds && body.settlementIds.length > 0
            ? new Set(body.settlementIds)
            : null;

        const candidates = listed.filter((row) => {
          if (row.status !== "claimed") return false;
          if (!isDebtSimplifyClaimNote(row.note)) return false;
          if (idFilter && !idFilter.has(row.id)) return false;
          return true;
        });

        const confirmed: SettlementSummary[] = [];
        const failed: Array<{ settlementId: string; detail: string }> = [];
        let skipped = 0;

        for (const candidate of candidates) {
          try {
            const row = await this.confirm(actor, workspaceId, candidate.id, {
              evidenceKind: "cash_ack",
              cashAckNote: "تأیید دسته‌ای ساده‌سازی بدهی",
            });
            if (row.status === "confirmed") {
              confirmed.push(row);
            } else {
              // Tier pending/rejected — claim stays open; not a hard failure.
              skipped += 1;
            }
          } catch (error: unknown) {
            const message = settlementConfirmErrorDetail(error);
            const denied =
              message.includes("اجازه") ||
              message.includes("forbidden") ||
              message.includes("Maker-checker") ||
              message.includes("چهارچشم") ||
              message.includes("Maker-checker required");
            if (denied) {
              skipped += 1;
            } else {
              failed.push({ settlementId: candidate.id, detail: message });
            }
          }
        }

        await this.audit.append({
          workspaceId,
          actorUserId: actor.userId,
          action: "settlement.simplify.confirm",
          targetType: "workspace",
          targetId: workspaceId,
          result: confirmed.length > 0 ? "success" : "failure",
          metadata: {
            confirmed: confirmed.length,
            failed: failed.length,
            skipped,
          },
        });

        return { workspaceId, confirmed, failed, skipped };
      },
    );
  }

  /** Preview net effect of hypothetical transfers from live ledger balances. */
  async previewSettlementEffect(
    actor: AuthActor,
    workspaceId: string,
    body: PreviewSettlementEffectRequest,
  ): Promise<PreviewSettlementEffectResponse> {
    await this.access.requireMemberRole(workspaceId, actor.userId);
    for (const t of body.transfers) {
      if (t.fromUserId === t.toUserId) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Settlement parties must differ",
          status: 400,
        });
      }
      await Promise.all([
        this.requireSettlementParty(workspaceId, t.fromUserId),
        this.requireSettlementParty(workspaceId, t.toUserId),
      ]);
    }

    const before = await this.ledger.balancesForWorkspace(
      workspaceId,
      actor.userId,
    );
    const after = previewBalancesAfterTransfers(before, body.transfers);
    return {
      workspaceId,
      before,
      after,
      zeroSumBefore: isZeroSumBalances(before),
      zeroSumAfter: isZeroSumBalances(after),
    };
  }

  private async requireSettlementParty(
    workspaceId: string,
    partyId: string,
  ): Promise<void> {
    if (isFundPartyId(partyId)) {
      if (!readProductFeatureFlags(process.env).fundAsSettlementParty) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Fund settlement party disabled",
          status: 400,
          detail: "طرف صندوق تنخواه در این محیط فعال نیست",
        });
      }
      return;
    }
    await this.access.requireMember(workspaceId, partyId);
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
   * When ENABLE_SETTLEMENT_EVIDENCE is on: require receipt / cash ack / gateway.
   */
  private async assertSettlementEvidence(
    workspaceId: string,
    settlementId: string,
    evidence: ConfirmSettlementRequest,
  ): Promise<void> {
    if (!readProductFeatureFlags(process.env).settlementEvidence) return;
    if (!evidence.evidenceKind) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Settlement evidence required",
        status: 400,
        code: "SETTLEMENT_EVIDENCE_REQUIRED",
        detail:
          "برای تأیید تسویه باید رسید تأییدشده، تأیید نقدی، یا درگاه ثبت شود",
      });
    }
    if (evidence.evidenceKind === "cash_ack") {
      if (!evidence.cashAckNote?.trim()) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Cash acknowledgment required",
          status: 400,
          code: "CASH_ACK_REQUIRED",
        });
      }
      return;
    }
    if (evidence.evidenceKind === "gateway") {
      return;
    }
    if (evidence.evidenceKind === "receipt") {
      if (!evidence.receiptId || !this.paymentOps) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Approved receipt required",
          status: 400,
          code: "RECEIPT_ID_REQUIRED",
        });
      }
      const receipt = await this.paymentOps.getReceipt(
        workspaceId,
        evidence.receiptId,
      );
      if (
        !receipt ||
        receipt.settlementId !== settlementId ||
        receipt.status !== "approved"
      ) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Receipt must be approved and linked to this settlement",
          status: 400,
          code: "RECEIPT_NOT_VALID",
        });
      }
    }
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

function settlementConfirmErrorDetail(error: unknown): string {
  if (error instanceof HttpException) {
    const res = error.getResponse();
    if (typeof res === "string") return res;
    if (res && typeof res === "object") {
      const obj = res as { title?: unknown; detail?: unknown; message?: unknown };
      if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
      if (typeof obj.title === "string" && obj.title.trim()) return obj.title;
      if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "confirm_failed";
}

