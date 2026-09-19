import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthActor, PlatformSloResponse, SloFixtureCounters } from "@dang/contracts";
import { ACCOUNT_STORE, type AccountStore } from "../auth/account.types.js";
import { getDlqLength } from "../jobs/redis-queue.js";
import { OUTBOX_STORE, type OutboxStore } from "../outbox/outbox.types.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { computePlatformSlo, SLO_WINDOWS } from "./slo.compute.js";

function hideNotFound(): never {
  throw new NotFoundException({
    type: "https://dang.local/problems/not-found",
    title: "Not Found",
    status: 404,
    detail: "Not Found",
  });
}

@Injectable()
export class SloService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(OUTBOX_STORE) private readonly outbox: OutboxStore,
    @Inject(SecurityEventsService) private readonly securityEvents: SecurityEventsService,
  ) {}

  private async requirePlatformRead(actor: AuthActor) {
    const user = await this.accounts.findById(actor.userId);
    if (!user || user.disabledAt) hideNotFound();
    if (
      user.platformRole !== "platform_owner" &&
      user.platformRole !== "platform_support"
    ) {
      hideNotFound();
    }
    return user;
  }

  async gatherGaugeCounters(): Promise<{
    outbox: SloFixtureCounters["outbox"];
    jobsDlq: SloFixtureCounters["jobsDlq"];
    notes: string[];
  }> {
    const notes: string[] = [];
    let outbox: SloFixtureCounters["outbox"];
    if (typeof this.outbox.getRelayStats === "function") {
      try {
        const stats = await this.outbox.getRelayStats();
        outbox = stats ?? null;
        if (!stats) notes.push("outbox relay stats unavailable");
      } catch {
        outbox = null;
        notes.push("outbox relay stats probe failed");
      }
    } else {
      outbox = null;
      notes.push("outbox store has no getRelayStats");
    }

    let jobsDlq: SloFixtureCounters["jobsDlq"];
    try {
      const length = await getDlqLength();
      jobsDlq = length == null ? null : { length };
      if (length == null) notes.push("jobs DLQ unavailable (Redis)");
    } catch {
      jobsDlq = null;
      notes.push("jobs DLQ probe failed");
    }

    return { outbox, jobsDlq, notes };
  }

  async snapshot(actor: AuthActor): Promise<PlatformSloResponse> {
    await this.requirePlatformRead(actor);
    const nowMs = Date.now();
    const { outbox, jobsDlq, notes } = await this.gatherGaugeCounters();
    const listed = await this.securityEvents.listRecent({ limit: 500 });

    const windows = SLO_WINDOWS.map((win) => {
      const cutoff = nowMs - win.durationMs;
      const inWindow = listed.items.filter(
        (e) => Date.parse(e.occurredAt) >= cutoff,
      );
      const highOrCriticalInWindow = inWindow.filter(
        (e) => e.severity === "high" || e.severity === "critical",
      ).length;
      const partial = computePlatformSlo(
        {
          outbox,
          jobsDlq,
          security: {
            totalInWindow: inWindow.length,
            highOrCriticalInWindow,
          },
        },
        { generatedAt: new Date(nowMs).toISOString() },
      );
      return (
        partial.windows.find((w) => w.id === win.id) ?? {
          id: win.id,
          durationMs: win.durationMs,
          signals: [],
          breached: false,
        }
      );
    });

    return {
      provider: "in_app_v1",
      generatedAt: new Date(nowMs).toISOString(),
      windows,
      breached: windows.some((w) => w.breached),
      notes: [
        ...notes,
        "security_error_rate from security-events store page (limit 500)",
        "outbox/DLQ are live gauges projected across windows",
        "not a Grafana/TSDB replacement",
      ],
    };
  }
}
