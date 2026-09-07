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
  dlqEntryMatchesWorkspace,
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

  async runForMember(
    actor: AuthActor,
    name: WorkerJobName,
    workspaceId: string,
    meta?: Record<string, string>,
  ): Promise<JobRunResult> {
    await this.requireMember(actor, workspaceId);
    return this.run(name, workspaceId, meta);
  }

  async run(
    name: WorkerJobName,
    workspaceId: string,
    meta?: Record<string, string>,
  ): Promise<JobRunResult> {
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
      const ok = await enqueueWorkerJob(queued);
      if (!ok) {
        logger.warn("Redis enqueue failed; rejecting job", { jobId, name });
        throw new ServiceUnavailableException({
          type: "https://dang.local/problems/redis-unavailable",
          title: "Job queue unavailable",
          status: 503,
          detail: "نمی‌توان کار را در صف Redis قرار داد؛ کمی بعد دوباره تلاش کنید",
        });
      }
      this.pending.push(queued);
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

  async listRecentForMember(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<JobRunResult[]> {
    await this.requireMember(actor, workspaceId);
    return this.runs.filter((r) => r.workspaceId === workspaceId).slice(-20);
  }

  listPending(): QueuedWorkerJob[] {
    return this.pending.slice(-50);
  }

  pendingCount(): number {
    return this.pending.length;
  }

  private async requireMember(actor: AuthActor, workspaceId: string): Promise<void> {
    const membership = await this.iam.getWorkspaceForUser(workspaceId, actor.userId);
    if (!membership) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "عضویت فضای کاری لازم است",
        status: 403,
      });
    }
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
    // Fetch a wider window so workspace filtering still yields up to `limit` items.
    const fetchLimit = Math.min(100, Math.max(limit * 4, limit));
    const [totalLength, items] = await Promise.all([
      getDlqLength(),
      listDlqItems(fetchLimit),
    ]);
    if (totalLength === null || items === null) {
      throw new ServiceUnavailableException({
        type: "https://dang.local/problems/redis-unavailable",
        title: "Redis unavailable",
        status: 503,
      });
    }
    // Prefer workspaceId match; entries without workspaceId remain visible to owner/admin.
    const filtered = items
      .filter((item) => dlqEntryMatchesWorkspace(item, workspaceId))
      .slice(0, limit);
    return { length: filtered.length, items: filtered, redis: true };
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
    const replayed = await replayDlqJob(workspaceId);
    const remaining = await getDlqLength();
    return { replayed, remaining };
  }
}
