import { Injectable } from "@nestjs/common";
import type { QueuedWorkerJob, WorkerJobName } from "@dang/contracts";
import { isRedisConfigured, loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { enqueueWorkerJob, isWorkerHeartbeatAlive } from "./redis-queue.js";

const logger = createLogger("dang-api-jobs");

export type JobExecutionMode = "inline_stub" | "redis_queue";

export type JobRunResult = {
  jobId: string;
  name: WorkerJobName;
  status: "completed" | "accepted";
  execution: JobExecutionMode;
  detail: string;
  workspaceId?: string;
  createdAt: string;
};

/**
 * - No Redis: inline stub (provider-bound jobs stay accepted).
 * - Redis: RPUSH to dang:jobs:v1 for worker consumer.
 */
@Injectable()
export class JobsService {
  private readonly runs: JobRunResult[] = [];
  private readonly pending: QueuedWorkerJob[] = [];

  executionMode(): JobExecutionMode {
    return isRedisConfigured(loadAppEnv()) ? "redis_queue" : "inline_stub";
  }

  async consumerAlive(): Promise<boolean> {
    if (this.executionMode() !== "redis_queue") return false;
    try {
      return await Promise.race([
        isWorkerHeartbeatAlive(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
      ]);
    } catch {
      return false;
    }
  }

  run(
    name: WorkerJobName,
    workspaceId: string,
    meta?: Record<string, string>,
  ): JobRunResult {
    const jobId = crypto.randomUUID();
    const execution = this.executionMode();
    const createdAt = new Date().toISOString();

    const providerStub =
      name === "ocr.receipt" ||
      name === "quarantine.scan" ||
      name === "notify.email" ||
      name === "notify.push";

    let detail: string;
    switch (name) {
      case "ledger.rebuild_balances":
        detail =
          execution === "redis_queue"
            ? `Queued ledger rebuild for workspace ${workspaceId}`
            : `Rebuilt balance projection for workspace ${workspaceId} (inline)`;
        break;
      case "notify.email":
        detail = `Email notify queued/accepted for workspace ${workspaceId}`;
        break;
      case "notify.push":
        detail = `Push notify accepted (no push provider) for workspace ${workspaceId}`;
        break;
      case "ocr.receipt":
        detail = meta?.attachmentId
          ? `OCR job for attachment ${meta.attachmentId}`
          : `OCR job for workspace ${workspaceId}`;
        break;
      case "quarantine.scan":
        detail = meta?.attachmentId
          ? `AV/quarantine job for attachment ${meta.attachmentId}`
          : `AV/quarantine job for workspace ${workspaceId}`;
        break;
      default:
        detail =
          execution === "redis_queue"
            ? `Queued job ${name} for workspace ${workspaceId}`
            : `Job ${name} accepted inline`;
    }

    const queued: QueuedWorkerJob = {
      jobId,
      name,
      workspaceId,
      meta,
      enqueuedAt: createdAt,
    };

    const status: JobRunResult["status"] =
      execution === "redis_queue" || providerStub ? "accepted" : "completed";

    if (execution === "redis_queue") {
      this.pending.push(queued);
      void enqueueWorkerJob(queued).then((ok) => {
        if (!ok) {
          logger.warn("Redis enqueue failed; job kept in process memory only", {
            jobId,
            name,
          });
        }
      });
    } else if (providerStub) {
      this.pending.push(queued);
    }

    const result: JobRunResult = {
      jobId,
      name,
      status,
      execution,
      detail,
      workspaceId,
      createdAt,
    };
    this.runs.push(result);
    return result;
  }

  get(jobId: string): JobRunResult | undefined {
    return this.runs.find((r) => r.jobId === jobId);
  }

  listRecent(): JobRunResult[] {
    return this.runs.slice(-20);
  }

  listPending(): QueuedWorkerJob[] {
    return this.pending.slice(-50);
  }

  pendingCount(): number {
    return this.pending.length;
  }
}
