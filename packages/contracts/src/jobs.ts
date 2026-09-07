export type WorkerJobName =
  | "ocr.receipt"
  | "quarantine.scan"
  | "notify.email"
  | "notify.push"
  | "report.export"
  | "webhook.dispatch"
  | "ledger.rebuild_balances"
  | "recurrence.tick"
  | "digest.weekly";

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
