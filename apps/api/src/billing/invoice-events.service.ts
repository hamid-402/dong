import { Inject, Injectable, Optional } from "@nestjs/common";
import { createLogger } from "@dang/observability";
import { OutboxRelay } from "../outbox/outbox.relay.js";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";

const logger = createLogger("dang-api-invoice-events");

/**
 * One place that announces "this member's invoice moved".
 *
 * Every writer of an invoice — the live projection, a payment that settles a
 * document, a finance manager acting by hand — goes through here, so the
 * members' screens refresh from a single event type instead of each caller
 * inventing its own signal.
 */
@Injectable()
export class InvoiceEventsService {
  constructor(
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Optional() @Inject(OutboxRelay) private readonly relay?: OutboxRelay,
  ) {}

  async announce(input: {
    workspaceId: string;
    periodId: string;
    memberUserIds: readonly string[];
    reason: string;
  }): Promise<void> {
    if (!input.periodId || input.memberUserIds.length === 0) return;
    try {
      const corr = this.relay?.correlation() ?? {};
      const row = await this.outbox.insert({
        workspaceId: input.workspaceId,
        aggregateType: "member_invoice",
        aggregateId: input.periodId,
        eventType: "invoice.recalculated",
        payload: {
          periodId: input.periodId,
          memberUserIds: [...input.memberUserIds],
          reason: input.reason,
        },
        requestId: corr.requestId,
        traceId: corr.traceId,
      });
      await this.relay?.dispatch(row);
    } catch (err: unknown) {
      // Announcing is never worth failing the write that already succeeded;
      // the relay retries pending rows and the sweep repairs stale screens.
      logger.warn("invoice announcement failed", {
        workspaceId: input.workspaceId,
        reason: input.reason,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
