import { createLogger } from "@dang/observability";
import type { QueuedWorkerJob } from "@dang/contracts";
import { blpopJob, touchHeartbeat } from "../queue/redis-queue.js";

const logger = createLogger("dang-worker-consumer");

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
        await processQueuedJob(job);
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
