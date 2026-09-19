import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { createLogger, getRequestId, getTraceId, withSpan } from "@dang/observability";
import type {
  OutboxExpensePostedPayload,
  OutboxInvoiceRecalculatedPayload,
  OutboxOnBehalfApprovedPayload,
  OutboxPeriodRolledPayload,
  OutboxSettlementConfirmedPayload,
} from "@dang/contracts";
import { NotificationsService } from "../notifications/notifications.service.js";
import { RealtimeHub } from "../notifications/realtime-hub.js";
import { WebhooksService } from "../webhooks/webhooks.service.js";
import {
  OUTBOX_BASE_BACKOFF_MS,
  OUTBOX_MAX_ATTEMPTS,
} from "./outbox.retry.js";
import { OUTBOX_STORE, type OutboxRecord, type OutboxStore } from "./outbox.types.js";

const logger = createLogger("dang-api-outbox-relay");

/** Law 10: max delivery attempts before dead-letter (no infinite retry). */
export const MAX_ATTEMPTS = OUTBOX_MAX_ATTEMPTS;
/** Law 10: base backoff ms; delay = BASE_BACKOFF_MS * 2^(attempts-1). */
export const BASE_BACKOFF_MS = OUTBOX_BASE_BACKOFF_MS;

export type OutboxRedriveResult = {
  attempted: number;
  processed: number;
  failed: number;
};

/**
 * Processes outbox rows after the money transaction commits.
 * Side-effects (in-app notify) run here so they stay additive and retryable.
 * W6: periodic redrive for pending/failed rows (Postgres SECURITY DEFINER list).
 *
 * Law 10 retry: MAX_ATTEMPTS=5, BASE_BACKOFF_MS=1000 exponential.
 * On failure stores increment attempts; at MAX mark dead_lettered_at;
 * otherwise set next_attempt_at. Redrive skips dead-lettered / not-yet-due.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
    @Optional() @Inject(RealtimeHub) private readonly realtime?: RealtimeHub,
    @Optional() @Inject(WebhooksService) private readonly webhooks?: WebhooksService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    const raw = process.env.OUTBOX_REDRIVE_INTERVAL_MS?.trim();
    const ms = raw ? Number(raw) : 30_000;
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.timer = setInterval(() => {
      void this.redrive(25).catch((err: unknown) => {
        logger.warn("outbox redrive tick failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
      });
    }, ms);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async redrive(limit = 25): Promise<OutboxRedriveResult> {
    const pending =
      typeof this.outbox.listPendingForRedrive === "function"
        ? await this.outbox.listPendingForRedrive(limit)
        : await this.outbox.listPending(limit);
    let processed = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await this.dispatch(row);
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    if (pending.length > 0) {
      logger.info("outbox redrive finished", {
        attempted: pending.length,
        processed,
        failed,
      });
    }
    return { attempted: pending.length, processed, failed };
  }

  async dispatch(record: OutboxRecord): Promise<void> {
    await withSpan(
      "outbox.dispatch",
      {
        eventType: record.eventType,
        workspaceId: record.workspaceId,
        outboxId: record.id,
      },
      async () => {
        try {
          await this.apply(record);
          if (
            record.eventType === "expense.posted" ||
            record.eventType === "settlement.confirmed"
          ) {
            await this.webhooks
              ?.dispatchEvent(
                record.workspaceId,
                record.eventType,
                record.payload,
              )
              .catch((err: unknown) => {
                logger.warn("outbound webhook fan-out failed", {
                  outboxId: record.id,
                  detail: err instanceof Error ? err.message : String(err),
                });
              });
          }
          await this.outbox.markProcessed(record.id, record.workspaceId);
        } catch (err: unknown) {
          const detail = err instanceof Error ? err.message : "unknown";
          logger.error("outbox dispatch failed", {
            outboxId: record.id,
            eventType: record.eventType,
            detail,
          });
          await this.outbox.markFailed(record.id, record.workspaceId, detail);
          throw err;
        }
      },
    );
  }

  private async apply(record: OutboxRecord): Promise<void> {
    // Realtime invalidation has no notification dependency — handle it first.
    switch (record.eventType) {
      case "expense.posted":
      case "expense.reversed": {
        const p = record.payload as unknown as Partial<OutboxExpensePostedPayload>;
        this.realtime?.publishInvalidate(
          record.workspaceId,
          p.participantUserIds ?? [],
          ["expenses", "balances", "statements"],
        );
        break;
      }
      case "invoice.recalculated": {
        const p = record.payload as unknown as OutboxInvoiceRecalculatedPayload;
        this.realtime?.publishInvalidate(record.workspaceId, p.memberUserIds ?? [], [
          "balances",
          "statements",
          `invoices:${p.periodId}`,
        ]);
        // A redrawn draft is silent; a correction notice on a locked document is
        // not, so the notify path continues for those members only.
        if (!p.adjustments?.length) return;
        break;
      }
      case "settlement.confirmed": {
        // A confirmed settlement moves the journal, so both sides' balances and
        // statements are stale the moment it lands.
        const p = record.payload as unknown as Partial<OutboxSettlementConfirmedPayload>;
        this.realtime?.publishInvalidate(
          record.workspaceId,
          [p.fromUserId, p.toUserId].filter(
            (userId): userId is string => Boolean(userId),
          ),
          ["settlements", "balances", "statements"],
        );
        break;
      }
      case "payment.on_behalf.approved": {
        const p = record.payload as unknown as OutboxOnBehalfApprovedPayload;
        this.realtime?.publishInvalidate(
          record.workspaceId,
          [p.debtorUserId, p.payerUserId].filter(Boolean),
          ["settlements", "balances", "statements"],
        );
        break;
      }
      case "period.rolled": {
        const p = record.payload as unknown as OutboxPeriodRolledPayload;
        this.realtime?.publishInvalidate(
          record.workspaceId,
          p.memberUserIds ?? [],
          ["periods", `invoices:${p.periodId}`],
        );
        return;
      }
      default:
        break;
    }
    if (!this.notifications) {
      logger.warn("notifications unavailable; marking outbox processed without notify", {
        outboxId: record.id,
      });
      return;
    }
    switch (record.eventType) {
      case "expense.posted": {
        const p = record.payload as unknown as OutboxExpensePostedPayload;
        await this.notifications.notifyExpensePosted(
          record.workspaceId,
          p.paidByUserId,
          p.title,
          p.participantUserIds,
        );
        return;
      }
      case "expense.reversed":
        // No in-app notify path today — event retained for consumers / audit hooks.
        return;
      case "invoice.recalculated": {
        const p = record.payload as unknown as OutboxInvoiceRecalculatedPayload;
        for (const adjustment of p.adjustments ?? []) {
          await this.notifications.notifyInvoiceAdjusted(
            record.workspaceId,
            p.actorUserId ?? adjustment.memberUserId,
            adjustment.memberUserId,
            adjustment.deltaMinor,
          );
        }
        return;
      }
      case "payment.on_behalf.approved": {
        const p = record.payload as unknown as OutboxOnBehalfApprovedPayload;
        await this.notifications.notifyOnBehalfPaid(
          record.workspaceId,
          p.payerUserId,
          p.debtorUserId,
          p.amountMinor,
        );
        return;
      }
      case "settlement.confirmed": {
        const p = record.payload as unknown as OutboxSettlementConfirmedPayload;
        await this.notifications.notifySettlementConfirmed(
          record.workspaceId,
          p.actorUserId,
          p.fromUserId,
          p.toUserId,
          p.amountMinor,
        );
        return;
      }
      default:
        logger.warn("unknown outbox event type", { eventType: record.eventType });
    }
  }

  /** Correlation helpers for writers. */
  correlation(): { requestId?: string; traceId?: string } {
    return { requestId: getRequestId(), traceId: getTraceId() };
  }
}
