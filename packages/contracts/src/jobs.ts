export type WorkerJobName =
  | "ocr.receipt"
  | "quarantine.scan"
  | "notify.email"
  | "notify.push"
  | "report.export"
  | "webhook.dispatch"
  | "ledger.rebuild_balances"
  | "recurrence.tick"
  | "digest.weekly"
  | "analytics.etl"
  /** Sweeps personal spending alerts and fires in-app/email notifications. */
  | "analytics.threshold"
  | "retention.purge"
  /** Opens the next cadence period for auto-rollover periods that ended. */
  | "billing.period.rollover"
  /** Proves ledger debt and live invoice totals still agree. */
  | "billing.invoice.reconcile"
  /** Reminds finance managers before a period ends (issuing stays manual). */
  | "billing.period.finalize.reminder"
  /** Monthly per-unit building charge drafts (G08 — runs inline in API). */
  | "building.charge.generate"
  /** Remind inviters about pending invites nearing expiry (G09 #52). */
  | "invite.remind"
  /** Scheduled settlement debt reminders (G11 #4 — runs inline in API). */
  | "settle.remind"
  /** Monthly straight-line asset depreciation (G10 — runs inline in API). */
  | "assets.depreciate.monthly";

/** Body for POST …/jobs (dev in-process runner). */
export type RunJobRequest = {
  name: WorkerJobName;
};

export type JobRunSummary = {
  jobId: string;
  name: WorkerJobName;
  status: "completed" | "failed";
  detail: string;
};

/** Redis list key — API RPUSH, worker BLPOP. */
export const DANG_JOB_QUEUE_KEY = "dang:jobs:v1";

/** Dead-letter list — worker RPUSH after exhausted retries; API lists / replays. */
export const DANG_JOB_DLQ_KEY = "dang:jobs:dlq:v1";

/** Worker sets this with TTL while polling. */
export const DANG_WORKER_HEARTBEAT_KEY = "dang:worker:heartbeat";

export type QueuedWorkerJob = {
  jobId: string;
  name: WorkerJobName;
  workspaceId: string;
  meta?: Record<string, string>;
  enqueuedAt: string;
  /** Correlation from API enqueue (R10-01). */
  requestId?: string;
  traceId?: string;
};

/** Payload written to `DANG_JOB_DLQ_KEY` after process retries are exhausted. */
export type DeadLetterJob = {
  job: QueuedWorkerJob;
  error: string;
  attempts: number;
  failedAt: string;
};

/** Build a DLQ entry (pure — used by worker + unit tests without Redis). */
export function buildDeadLetterJob(
  job: QueuedWorkerJob,
  error: unknown,
  attempts: number,
  failedAt: string = new Date().toISOString(),
): DeadLetterJob {
  const message =
    error instanceof Error
      ? error.message || error.name
      : typeof error === "string"
        ? error
        : String(error);
  return {
    job,
    error: message.slice(0, 2000),
    attempts,
    failedAt,
  };
}
