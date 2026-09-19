/**
 * In-app SLO snapshot (R10-01 depth) — burn rates from live relay/DLQ/security counters.
 * Not a Grafana replacement; windows use the same fixture/live snapshot until a TSDB exists.
 */

export type SloProviderMode = "in_app_v1";

export type SloWindowId = "5m" | "1h" | "24h";

export type SloSignalId = "outbox_relay" | "jobs_dlq" | "security_error_rate";

export type SloSignalSnapshot = {
  id: SloSignalId;
  /** False when the backing counter cannot be read (Redis down, empty sample, RLS, …). */
  available: boolean;
  unavailableReason?: string;
  /** Observed raw counters for this signal (honest; may be empty). */
  observed: Record<string, number | null>;
  /**
   * Burn rate vs budget (1.0 = fully consuming error budget for the window).
   * Null when `available` is false — never invent a rate.
   */
  burnRate: number | null;
  /** Threshold at which `breached` becomes true (burnRate >= threshold). */
  threshold: number;
  /** True only when available and burnRate >= threshold. */
  breached: boolean;
};

export type SloWindowSnapshot = {
  id: SloWindowId;
  durationMs: number;
  signals: SloSignalSnapshot[];
  /** True when any *available* signal is breached. */
  breached: boolean;
};

export type PlatformSloResponse = {
  provider: SloProviderMode;
  generatedAt: string;
  windows: SloWindowSnapshot[];
  /** True when any window is breached. */
  breached: boolean;
  notes?: string[];
};

/** Fixture counters for pure compute / unit tests. */
export type SloFixtureCounters = {
  outbox?: {
    pendingCount: number;
    failedPendingCount: number;
    oldestPendingAgeMs: number | null;
  } | null;
  jobsDlq?: { length: number } | null;
  security?: {
    /** Events whose occurredAt falls inside the evaluation window. */
    totalInWindow: number;
    highOrCriticalInWindow: number;
  } | null;
};
