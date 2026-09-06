import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  AuthActor,
  DeadLetterJob,
  MembershipRole,
  QueuedWorkerJob,
  WorkerJobName,
} from "@dang/contracts";
import { isRedisConfigured, loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import {
  enqueueWorkerJob,
  getDlqLength,
  isWorkerHeartbeatAlive,
  listDlqItems,
  replayDlqJob,
} from "./redis-queue.js";

const logger = createLogger("dang-api-jobs");

const DLQ_ROLES = new Set<MembershipRole>(["owner", "admin"]);

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

export type DlqListResult = {
  length: number;
  items: DeadLetterJob[];
  redis: true;
};

/**
 * - No Redis: inline stub (provider-bound jobs stay accepted).
 * - Redis: RPUSH to dang:jobs:v1 for worker consumer.
 */
@Injectable()
export class JobsService {
  private readonly runs: JobRunResult[] = [];
  private readonly pending: QueuedWorkerJob[] = [];

  constructor(@Inject(IAM_STORE) private readonly iam: IamStore) {}

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

  private async requireOwnerOrAdmin(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<void> {
    const members = await this.iam.listMembers(workspaceId, actor.userId);
    if (!members) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Not a workspace member",
        status: 403,
      });
    }
    const self = members.find((m) => m.userId === actor.userId);
    if (!self || !DLQ_ROLES.has(self.role)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Only owner/admin can manage the job DLQ",
        status: 403,
      });
    }
  }

  async listDlq(actor: AuthActor, workspaceId: string, limit = 50): Promise<DlqListResult> {
    await this.requireOwnerOrAdmin(actor, workspaceId);
    if (this.executionMode() !== "redis_queue") {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/redis-unavailable",
        title: "Redis job queue not configured",
        status: 503,
        detail: "DLQ requires REDIS_URL and redis_queue execution mode.",
      });
    }
    const [length, items] = await Promise.all([getDlqLength(), listDlqItems(limit)]);
    if (length === null || items === null) {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/redis-unavailable",
        title: "Redis unavailable",
        status: 503,
      });
    }
    return { length, items, redis: true };
  }

  async replayDlq(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<{ replayed: DeadLetterJob | null; remaining: number | null }> {
    await this.requireOwnerOrAdmin(actor, workspaceId);
    if (this.executionMode() !== "redis_queue") {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/redis-unavailable",
        title: "Redis job queue not configured",
        status: 503,
      });
    }
    const replayed = await replayDlqJob();
    const remaining = await getDlqLength();
    return { replayed, remaining };
  }
}
