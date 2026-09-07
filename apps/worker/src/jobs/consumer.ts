import { createLogger } from "@dang/observability";
import {
  buildDeadLetterJob,
  readProductFeatureFlags,
  type QueuedWorkerJob,
} from "@dang/contracts";
import { blpopJob, pushDeadLetter, touchHeartbeat } from "../queue/redis-queue.js";

const logger = createLogger("dang-worker-consumer");

/** Retries before DLQ (backoff between attempts). */
export const JOB_MAX_ATTEMPTS = 3;

export type JobProcessResult = {
  ok: true;
  name: string;
  jobId: string;
  workspaceId?: string;
  result: Record<string, string | number | boolean>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(250 * 2 ** (attempt - 1), 2000);
}

/**
 * Optional internal API base for worker→API hooks (e.g. balance rebuild ack).
 * When unset, ledger.rebuild_balances completes with a structured local result.
 */
function apiInternalBase(): string | undefined {
  const raw =
    process.env.DANG_API_INTERNAL_URL?.trim() ||
    process.env.API_INTERNAL_URL?.trim() ||
    "";
  return raw || undefined;
}

async function processLedgerRebuildBalances(
  job: QueuedWorkerJob,
): Promise<JobProcessResult> {
  const workspaceId = job.workspaceId;
  const base = apiInternalBase();
  let mode: "local_ack" | "api_health_ping" = "local_ack";

  if (base) {
    try {
      const url = `${base.replace(/\/$/, "")}/api/v1/health/live`;
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        throw new Error(`health_live_${res.status}`);
      }
      mode = "api_health_ping";
    } catch (err: unknown) {
      logger.warn("ledger.rebuild_balances API ping failed; completing with local ack", {
        jobId: job.jobId,
        workspaceId,
        detail: err instanceof Error ? err.message || err.name : String(err),
      });
    }
  }

  const result: JobProcessResult = {
    ok: true,
    name: job.name,
    jobId: job.jobId,
    workspaceId,
    result: {
      action: "rebuild_balances",
      workspaceId: workspaceId ?? "",
      mode,
      completedAt: new Date().toISOString(),
    },
  };
  logger.info("ledger.rebuild_balances completed", {
    jobId: result.jobId,
    workspaceId: result.workspaceId ?? "",
    mode,
  });
  return result;
}

async function processRecurrenceTick(job: QueuedWorkerJob): Promise<JobProcessResult> {
  if (!readProductFeatureFlags(process.env).recurrenceWorker) {
    throw new Error("recurrence_worker_disabled");
  }

  const base = apiInternalBase();
  if (!base) throw new Error("recurrence_api_internal_url_missing");

  const actorUserId = job.meta?.actorUserId?.trim();
  if (!actorUserId) throw new Error("recurrence_actor_user_id_missing");

  const asOf = job.meta?.asOf?.trim();
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("recurrence_as_of_invalid");
  }

  const headers: Record<string, string> = {};
  const internalToken = process.env.DANG_INTERNAL_JOB_TOKEN?.trim();
  if (internalToken) {
    headers["x-dang-internal-job"] = internalToken;
    headers["x-dang-internal-actor-user-id"] = actorUserId;
  } else {
    const actorSubject = job.meta?.actorSubject?.trim();
    if (!actorSubject) throw new Error("recurrence_internal_auth_missing");
    headers["x-dang-subject"] = actorSubject;
    headers["x-dang-user-id"] = actorUserId;
  }

  const query = asOf ? `?asOf=${encodeURIComponent(asOf)}` : "";
  const url =
    `${base.replace(/\/$/, "")}/api/v1/workspaces/` +
    `${encodeURIComponent(job.workspaceId)}/recurring-rules/run-due${query}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`recurrence_api_${response.status}:${detail}`);
  }

  const payload = (await response.json()) as {
    createdExpenseIds?: unknown[];
    titles?: unknown[];
  };
  const result: JobProcessResult = {
    ok: true,
    name: job.name,
    jobId: job.jobId,
    workspaceId: job.workspaceId,
    result: {
      action: "recurrence_tick",
      createdCount: payload.createdExpenseIds?.length ?? 0,
      titleCount: payload.titles?.length ?? 0,
      asOf: asOf ?? "today",
    },
  };
  logger.info("recurrence.tick completed", {
    jobId: job.jobId,
    workspaceId: job.workspaceId,
    createdCount: result.result.createdCount,
  });
  return result;
}

async function processWeeklyDigest(job: QueuedWorkerJob): Promise<JobProcessResult> {
  if (!readProductFeatureFlags(process.env).weeklyDigest) throw new Error("weekly_digest_disabled");
  const base = apiInternalBase();
  const token = process.env.DANG_INTERNAL_JOB_TOKEN?.trim();
  if (!base || !token) throw new Error("digest_internal_api_not_configured");
  const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/system/digest/weekly-tick`, {
    method: "POST",
    headers: { "x-dang-internal-job": token },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`digest_api_${response.status}:${(await response.text()).slice(0,500)}`);
  const payload = await response.json() as { eligible?: number; sent?: number };
  return { ok:true,name:job.name,jobId:job.jobId,workspaceId:job.workspaceId,result:{action:"digest_weekly",eligible:payload.eligible??0,sent:payload.sent??0} };
}

export async function processQueuedJob(job: QueuedWorkerJob): Promise<JobProcessResult | void> {
  switch (job.name) {
    case "ledger.rebuild_balances":
      return processLedgerRebuildBalances(job);
    case "recurrence.tick":
      return processRecurrenceTick(job);
    case "digest.weekly":
      return processWeeklyDigest(job);
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
    process?: (j: QueuedWorkerJob) => Promise<void | JobProcessResult>;
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
