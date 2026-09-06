import { createLogger } from "@dang/observability";
import { buildDeadLetterJob, type QueuedWorkerJob } from "@dang/contracts";
import { blpopJob, pushDeadLetter, touchHeartbeat } from "../queue/redis-queue.js";

const logger = createLogger("dang-worker-consumer");

/** Retries before DLQ (backoff between attempts). */
export const JOB_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(250 * 2 ** (attempt - 1), 2000);
}

export async function processQueuedJob(job: QueuedWorkerJob): Promise<void> {
  switch (job.name) {
    case "ledger.rebuild_balances":
      logger.info("Processed ledger.rebuild_balances", {
        jobId: job.jobId,
        workspaceId: job.workspaceId,
      });
      break;
    case "report.export":
      logger.info("Processed report.export (file generation hook ready)", {
        jobId: job.jobId,
        workspaceId: job.workspaceId,
      });
      break;
    case "webhook.dispatch":
      logger.info("Processed webhook.dispatch (delivery hook ready)", {
        jobId: job.jobId,
        workspaceId: job.workspaceId,
      });
      break;
    case "ocr.receipt":
      logger.info("OCR job consumed (provider live only with OCR_ENABLED)", {
        jobId: job.jobId,
        attachmentId: job.meta?.attachmentId ?? "",
      });
      break;
    case "quarantine.scan":
      logger.info("AV job consumed (ClamAV live only with CLAMAV_ENABLED)", {
        jobId: job.jobId,
        attachmentId: job.meta?.attachmentId ?? "",
      });
      break;
    case "notify.email":
      logger.info("Email notify job consumed (delivery via API mailer path)", {
        jobId: job.jobId,
      });
      break;
    case "notify.push":
      logger.info("Push notify stub consumed (no push provider)", {
        jobId: job.jobId,
      });
      break;
    default:
      logger.warn("Unknown job name", { name: String(job.name), jobId: job.jobId });
  }
}

/**
 * Run `processQueuedJob` up to JOB_MAX_ATTEMPTS with backoff; on final failure RPUSH DLQ.
 * Exported for unit tests of retry/DLQ wiring without Redis (mock pushDeadLetter via injection in tests).
 */
export async function processQueuedJobWithRetries(
  job: QueuedWorkerJob,
  opts?: {
    maxAttempts?: number;
    process?: (j: QueuedWorkerJob) => Promise<void>;
    pushDlq?: (entry: ReturnType<typeof buildDeadLetterJob>) => Promise<boolean>;
  },
): Promise<"ok" | "dlq" | "dlq_push_failed"> {
  const maxAttempts = opts?.maxAttempts ?? JOB_MAX_ATTEMPTS;
  const run = opts?.process ?? processQueuedJob;
  const pushDlq = opts?.pushDlq ?? pushDeadLetter;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await run(job);
      return "ok";
    } catch (err: unknown) {
      lastError = err;
      logger.warn("Job attempt failed", {
        jobId: job.jobId,
        name: job.name,
        attempt,
        maxAttempts,
        detail: err instanceof Error ? err.message || err.name : String(err),
      });
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
      }
    }
  }

  const entry = buildDeadLetterJob(job, lastError, maxAttempts);
  const pushed = await pushDlq(entry);
  if (!pushed) {
    logger.error("Failed to RPUSH dead-letter after retries", {
      jobId: job.jobId,
      name: job.name,
      error: entry.error,
    });
    return "dlq_push_failed";
  }
  logger.error("Job moved to DLQ after retries", {
    jobId: job.jobId,
    name: job.name,
    attempts: maxAttempts,
    error: entry.error,
  });
  return "dlq";
}

export type ConsumerSignal = {
  stopped: boolean;
  inFlight: boolean;
};

/**
 * Blocks on Redis BLPOP until SIGTERM/SIGINT.
 * A job already popped is always finished before exit (no mid-job kill).
 */
export async function runConsumerLoop(signal: ConsumerSignal): Promise<void> {
  logger.info("Worker consumer loop starting");
  while (!signal.stopped) {
    try {
      const touched = await touchHeartbeat();
      if (!touched) {
        logger.warn("Redis unavailable — retrying consumer in 3s");
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (signal.stopped) break;
      const job = await blpopJob(5);
      if (!job) continue;
      // Finish this job even if stop arrived during BLPOP — work was already claimed.
      signal.inFlight = true;
      try {
        await processQueuedJobWithRetries(job);
      } finally {
        signal.inFlight = false;
      }
    } catch (err: unknown) {
      signal.inFlight = false;
      logger.error("Consumer iteration failed", {
        detail: err instanceof Error ? err.message || err.name : String(err),
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  while (signal.inFlight) {
    await new Promise((r) => setTimeout(r, 50));
  }
  logger.info("Worker consumer loop stopped");
}
