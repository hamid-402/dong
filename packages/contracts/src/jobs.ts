export type WorkerJobName =
  | "ocr.receipt"
  | "quarantine.scan"
  | "notify.email"
  | "notify.push"
  | "report.export"
  | "webhook.dispatch"
  | "ledger.rebuild_balances";

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

/** Worker sets this with TTL while polling. */
export const DANG_WORKER_HEARTBEAT_KEY = "dang:worker:heartbeat";

export type QueuedWorkerJob = {
  jobId: string;
  name: WorkerJobName;
  workspaceId: string;
  meta?: Record<string, string>;
  enqueuedAt: string;
};
