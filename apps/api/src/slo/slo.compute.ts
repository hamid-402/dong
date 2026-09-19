/**
 * Pure SLO burn-rate math from fixture/live counters (R10-01).
 * No Nest deps — unit-testable with fixture counters.
 */
import type {
  PlatformSloResponse,
  SloFixtureCounters,
  SloSignalSnapshot,
  SloWindowId,
  SloWindowSnapshot,
} from "@dang/contracts";

/** Proxy thresholds aligned with QUALITY §7 + ops RPO (local, not cloud Grafana). */
export const SLO_THRESHOLDS = {
  /** Oldest pending outbox age budget (ms) — aligns with RPO ≤ 5m. */
  outboxMaxPendingAgeMs: 5 * 60 * 1000,
  /** Any failed pending relay burns full budget. */
  outboxFailedPendingBudget: 1,
  /** DLQ length budget: any dead letter is a full burn for the window. */
  jobsDlqBudget: 1,
  /** High/critical security-event rate budget (1%). */
  securityMaxErrorRate: 0.01,
  /** Below this sample size, security signal is unavailable (honest empty). */
  securityMinSample: 5,
  /** Multi-window burn multiplier (fast burn on short window). */
  windowBurnFactor: {
    "5m": 14.4,
    "1h": 6,
    "24h": 1,
  } as Record<SloWindowId, number>,
} as const;

export const SLO_WINDOWS: ReadonlyArray<{ id: SloWindowId; durationMs: number }> = [
  { id: "5m", durationMs: 5 * 60 * 1000 },
  { id: "1h", durationMs: 60 * 60 * 1000 },
  { id: "24h", durationMs: 24 * 60 * 60 * 1000 },
];

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function signal(
  partial: Omit<SloSignalSnapshot, "breached"> & { breached?: boolean },
): SloSignalSnapshot {
  const available = partial.available;
  const burnRate = available ? partial.burnRate : null;
  const breached =
    available && burnRate != null && burnRate >= partial.threshold;
  return {
    id: partial.id,
    available,
    unavailableReason: partial.unavailableReason,
    observed: partial.observed,
    burnRate,
    threshold: partial.threshold,
    breached,
  };
}

function outboxSignal(
  counters: SloFixtureCounters,
  windowId: SloWindowId,
): SloSignalSnapshot {
  const o = counters.outbox;
  if (o === null) {
    return signal({
      id: "outbox_relay",
      available: false,
      unavailableReason: "outbox_stats_unavailable",
      observed: {},
      burnRate: null,
      threshold: 1,
    });
  }
  if (o === undefined) {
    return signal({
      id: "outbox_relay",
      available: false,
      unavailableReason: "outbox_not_wired",
      observed: {},
      burnRate: null,
      threshold: 1,
    });
  }

  const age = o.oldestPendingAgeMs ?? 0;
  const ageBurn =
    SLO_THRESHOLDS.outboxMaxPendingAgeMs > 0
      ? age / SLO_THRESHOLDS.outboxMaxPendingAgeMs
      : 0;
  const failBurn =
    o.failedPendingCount / SLO_THRESHOLDS.outboxFailedPendingBudget;
  const factor = SLO_THRESHOLDS.windowBurnFactor[windowId];
  const burnRate = round4(Math.max(ageBurn, failBurn) * factor);
  const threshold = 1;

  return signal({
    id: "outbox_relay",
    available: true,
    observed: {
      pendingCount: o.pendingCount,
      failedPendingCount: o.failedPendingCount,
      oldestPendingAgeMs: o.oldestPendingAgeMs,
    },
    burnRate,
    threshold,
  });
}

function dlqSignal(
  counters: SloFixtureCounters,
  windowId: SloWindowId,
): SloSignalSnapshot {
  const d = counters.jobsDlq;
  if (d === null) {
    return signal({
      id: "jobs_dlq",
      available: false,
      unavailableReason: "redis_dlq_unavailable",
      observed: {},
      burnRate: null,
      threshold: 1,
    });
  }
  if (d === undefined) {
    return signal({
      id: "jobs_dlq",
      available: false,
      unavailableReason: "jobs_dlq_not_wired",
      observed: {},
      burnRate: null,
      threshold: 1,
    });
  }

  const factor = SLO_THRESHOLDS.windowBurnFactor[windowId];
  const burnRate = round4(
    (d.length / SLO_THRESHOLDS.jobsDlqBudget) * factor,
  );
  return signal({
    id: "jobs_dlq",
    available: true,
    observed: { length: d.length },
    burnRate,
    threshold: 1,
  });
}

function securitySignal(
  counters: SloFixtureCounters,
  windowId: SloWindowId,
): SloSignalSnapshot {
  const s = counters.security;
  if (s === null) {
    return signal({
      id: "security_error_rate",
      available: false,
      unavailableReason: "security_events_unavailable",
      observed: {},
      burnRate: null,
      threshold: 1,
    });
  }
  if (s === undefined) {
    return signal({
      id: "security_error_rate",
      available: false,
      unavailableReason: "security_not_wired",
      observed: {},
      burnRate: null,
      threshold: 1,
    });
  }

  if (s.totalInWindow < SLO_THRESHOLDS.securityMinSample) {
    return signal({
      id: "security_error_rate",
      available: false,
      unavailableReason: "insufficient_sample",
      observed: {
        totalInWindow: s.totalInWindow,
        highOrCriticalInWindow: s.highOrCriticalInWindow,
        minSample: SLO_THRESHOLDS.securityMinSample,
      },
      burnRate: null,
      threshold: 1,
    });
  }

  const errorRate = s.highOrCriticalInWindow / s.totalInWindow;
  const factor = SLO_THRESHOLDS.windowBurnFactor[windowId];
  const burnRate = round4(
    (errorRate / SLO_THRESHOLDS.securityMaxErrorRate) * factor,
  );
  return signal({
    id: "security_error_rate",
    available: true,
    observed: {
      totalInWindow: s.totalInWindow,
      highOrCriticalInWindow: s.highOrCriticalInWindow,
      errorRate: round4(errorRate),
    },
    burnRate,
    threshold: 1,
  });
}

/**
 * Build platform SLO response from counters.
 * Pass `null` for a source that was probed and missing; omit/`undefined` when not wired.
 */
export function computePlatformSlo(
  counters: SloFixtureCounters,
  opts?: { generatedAt?: string; notes?: string[] },
): PlatformSloResponse {
  const windows: SloWindowSnapshot[] = SLO_WINDOWS.map((win) => {
    const signals = [
      outboxSignal(counters, win.id),
      dlqSignal(counters, win.id),
      securitySignal(counters, win.id),
    ];
    return {
      id: win.id,
      durationMs: win.durationMs,
      signals,
      breached: signals.some((s) => s.breached),
    };
  });

  return {
    provider: "in_app_v1",
    generatedAt: opts?.generatedAt ?? new Date().toISOString(),
    windows,
    breached: windows.some((win) => win.breached),
    notes: opts?.notes,
  };
}
