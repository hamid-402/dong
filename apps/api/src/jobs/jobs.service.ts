import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type {
  AuthActor,
  DeadLetterJob,
  QueuedWorkerJob,
  WorkerJobName,
} from "@dang/contracts";
import { isRedisConfigured, loadAppEnv } from "@dang/config";
import { createLogger, getRequestId, getTraceId, withSpan } from "@dang/observability";
import { WorkspaceAccessService } from "../iam/workspace-access.service.js";
import type { RetentionService } from "../retention/retention.service.js";
import type { BillingMaintenanceService } from "../billing/billing-maintenance.service.js";
import type { PersonalFinanceService } from "../personal-finance/personal-finance.service.js";
import type { InvitesService } from "../invites/invites.service.js";
import type { BalancesService } from "../balances/balances.service.js";
import type { BuildingChargesService } from "../building-charges/building-charges.service.js";
import type { AssetsService } from "../assets/assets.service.js";
import {
  enqueueWorkerJob,
  getDlqLength,
  isWorkerHeartbeatAlive,
  listDlqItems,
  replayDlqJob,
  dlqEntryMatchesWorkspace,
} from "./redis-queue.js";
import { JOB_RUN_STORE, type JobRunStore } from "./job-run.types.js";
import { MemoryJobRunStore } from "./memory-job-run.store.js";

const logger = createLogger("dang-api-jobs");

export type JobExecutionMode = "inline_stub" | "redis_queue";

export type JobRunResult = {
  jobId: string;
  name: WorkerJobName;
  status: "completed" | "accepted" | "failed";
  execution: JobExecutionMode;
  detail: string;
  workspaceId?: string;
  createdAt: string;
  finishedAt?: string;
  lastError?: string;
  /** Where this run was persisted (honest). */
  runsPersistence?: "memory" | "postgres";
};

export type DlqListResult = {
  length: number;
  items: DeadLetterJob[];
  redis: true;
};

/**
 * - No Redis: inline stub (provider-bound jobs stay accepted).
 * - Redis: RPUSH to dang:jobs:v1 for worker consumer.
 * - Run history: JOB_RUN_STORE (memory or Postgres ops.job_run).
 * - Worker write-back may later set completed/failed + finished_at.
 */
@Injectable()
export class JobsService {
  private readonly pending: QueuedWorkerJob[] = [];

  constructor(
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(JOB_RUN_STORE) private readonly runs: JobRunStore,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Lazy — avoids JobsModule↔RetentionModule↔Statements↔Expenses cycle. */
  private retention(): RetentionService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { RetentionService: R } = require("../retention/retention.service.js") as {
        RetentionService: new (...args: never[]) => RetentionService;
      };
      return this.moduleRef.get(R, { strict: false });
    } catch {
      return undefined;
    }
  }

  executionMode(): JobExecutionMode {
    return isRedisConfigured(loadAppEnv()) ? "redis_queue" : "inline_stub";
  }

  runsPersistence(): "memory" | "postgres" {
    return this.runs.persistence;
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
    await this.access.requireMember(workspaceId, actor.userId);
    if (name === "settle.remind") {
      await this.access.requireFinanceManager(workspaceId, actor.userId);
    }
    const jobMeta =
      name === "recurrence.tick" ||
      name === "analytics.etl" ||
      name === "analytics.threshold" ||
      name.startsWith("billing.") ||
      name === "building.charge.generate" ||
      name === "assets.depreciate.monthly" ||
      name === "invite.remind" ||
      name === "settle.remind"
        ? {
            ...meta,
            actorUserId: actor.userId,
            actorSubject: actor.externalSubject,
          }
        : meta;
    return this.run(name, workspaceId, jobMeta);
  }

  async run(
    name: WorkerJobName,
    workspaceId: string,
    meta?: Record<string, string>,
  ): Promise<JobRunResult> {
    return withSpan("jobs.enqueue", { name, workspaceId }, async () => {
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
              ? `Queued ledger.rebuild_balances ack for workspace ${workspaceId} (no projection table — balances are live journal compute)`
              : `ledger.rebuild_balances ack inline for workspace ${workspaceId} (no durable projection rebuild)`;
          break;
        case "recurrence.tick":
          detail =
            execution === "redis_queue"
              ? `Queued recurrence tick for workspace ${workspaceId}`
              : `Recurrence tick accepted inline for workspace ${workspaceId}`;
          break;
        case "digest.weekly":
          detail =
            execution === "redis_queue"
              ? "Queued weekly digest tick"
              : "Weekly digest tick accepted inline";
          break;
        case "analytics.etl":
          detail =
            execution === "redis_queue"
              ? `Queued analytics ETL for workspace ${workspaceId}`
              : `Analytics ETL accepted inline for workspace ${workspaceId}`;
          break;
        case "analytics.threshold":
          detail = `Running analytics.threshold inline for user ${meta?.actorUserId ?? workspaceId}`;
          break;
        case "retention.purge":
          detail =
            execution === "redis_queue"
              ? "Queued retention.purge (statements + blocked attachment blobs)"
              : "Running retention.purge inline";
          break;
        case "billing.period.rollover":
        case "billing.invoice.reconcile":
        case "billing.period.finalize.reminder":
          detail = `Running ${name} inline for workspace ${workspaceId}`;
          break;
        case "building.charge.generate":
          detail = `Running building.charge.generate inline for workspace ${workspaceId}`;
          break;
        case "assets.depreciate.monthly":
          detail = `Running assets.depreciate.monthly inline for workspace ${workspaceId}`;
          break;
        case "invite.remind":
          detail = `Running invite.remind inline for workspace ${workspaceId}`;
          break;
        case "settle.remind":
          detail = `Running settle.remind inline for workspace ${workspaceId}`;
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
        requestId: getRequestId(),
        traceId: getTraceId(),
      };

      /**
       * Billing hygiene runs in the API process: the standalone worker has no
       * billing store, so queueing these would accept work nobody performs.
       */
      const billingJob = name.startsWith("billing.");
      const buildingChargeJob = name === "building.charge.generate";
      const assetsDepreciateJob = name === "assets.depreciate.monthly";
      const thresholdJob = name === "analytics.threshold";
      const inviteRemindJob = name === "invite.remind";
      const settleRemindJob = name === "settle.remind";
      const forceInlineJob =
        billingJob ||
        buildingChargeJob ||
        assetsDepreciateJob ||
        thresholdJob ||
        inviteRemindJob ||
        settleRemindJob;

      let status: JobRunResult["status"] =
        (execution === "redis_queue" && !forceInlineJob) || providerStub
          ? "accepted"
          : "completed";
      let finishedAt: string | undefined;
      let lastError: string | undefined;

      if (billingJob) {
        try {
          detail = await this.runBillingJob(name, workspaceId, meta?.actorUserId);
          status = "completed";
          finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          status = "failed";
          finishedAt = new Date().toISOString();
          lastError = err instanceof Error ? err.message || err.name : String(err);
          detail = `${name} inline failed: ${lastError}`;
        }
      } else if (buildingChargeJob) {
        try {
          detail = await this.runBuildingChargeJob(workspaceId, meta);
          status = "completed";
          finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          status = "failed";
          finishedAt = new Date().toISOString();
          lastError = err instanceof Error ? err.message || err.name : String(err);
          detail = `${name} inline failed: ${lastError}`;
        }
      } else if (assetsDepreciateJob) {
        try {
          detail = await this.runAssetsDepreciateJob(workspaceId, meta);
          status = "completed";
          finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          status = "failed";
          finishedAt = new Date().toISOString();
          lastError = err instanceof Error ? err.message || err.name : String(err);
          detail = `${name} inline failed: ${lastError}`;
        }
      } else if (thresholdJob) {
        try {
          detail = await this.runThresholdJob(meta?.actorUserId, meta?.asOf);
          status = "completed";
          finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          status = "failed";
          finishedAt = new Date().toISOString();
          lastError = err instanceof Error ? err.message || err.name : String(err);
          detail = `analytics.threshold inline failed: ${lastError}`;
        }
      } else if (inviteRemindJob) {
        try {
          detail = await this.runInviteRemindJob(workspaceId, meta?.actorUserId);
          status = "completed";
          finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          status = "failed";
          finishedAt = new Date().toISOString();
          lastError = err instanceof Error ? err.message || err.name : String(err);
          detail = `invite.remind inline failed: ${lastError}`;
        }
      } else if (settleRemindJob) {
        try {
          detail = await this.runSettleRemindJob(workspaceId, meta?.actorUserId);
          status = "completed";
          finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          status = "failed";
          finishedAt = new Date().toISOString();
          lastError = err instanceof Error ? err.message || err.name : String(err);
          detail = `settle.remind inline failed: ${lastError}`;
        }
      } else if (execution === "redis_queue") {
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
      } else if (name === "retention.purge") {
        const retention = this.retention();
        if (retention) {
          try {
            const purged = await retention.runPurge();
            detail = `retention.purge inline: statements=${purged.statementBodies} attachments=${purged.attachmentBlobs}`;
            status = "completed";
            finishedAt = purged.ranAt;
          } catch (err: unknown) {
            status = "failed";
            finishedAt = new Date().toISOString();
            lastError =
              err instanceof Error ? err.message || err.name : String(err);
            detail = `retention.purge inline failed: ${lastError}`;
          }
        } else {
          detail =
            "retention.purge accepted but RetentionService not available in this process";
        }
      }

      const result: JobRunResult = {
        jobId,
        name,
        status,
        execution,
        detail,
        workspaceId,
        createdAt,
        finishedAt,
        lastError,
        runsPersistence: this.runs.persistence,
      };
      await this.runs.append({
        jobId,
        name,
        status,
        execution,
        detail,
        workspaceId,
        createdAt,
        finishedAt,
        lastError,
      });
      return result;
    });
  }

  /** Lazy resolve — keeps JobsModule free of a static BillingModule import. */
  private billingMaintenance(): BillingMaintenanceService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { BillingMaintenanceService: S } = require(
        "../billing/billing-maintenance.service.js",
      ) as { BillingMaintenanceService: new (...args: never[]) => BillingMaintenanceService };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  /** Lazy resolve — avoids JobsModule ↔ PersonalFinanceModule cycle. */
  private personalFinance(): PersonalFinanceService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { PersonalFinanceService: S } = require(
        "../personal-finance/personal-finance.service.js",
      ) as { PersonalFinanceService: new (...args: never[]) => PersonalFinanceService };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  private invites(): InvitesService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { InvitesService: S } = require("../invites/invites.service.js") as {
        InvitesService: new (...args: never[]) => InvitesService;
      };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async runInviteRemindJob(
    workspaceId: string,
    actorUserId?: string,
  ): Promise<string> {
    const userId = actorUserId?.trim();
    if (!userId) throw new Error("invite.remind needs meta.actorUserId");
    const service = this.invites();
    if (!service) throw new Error("InvitesService not available in this process");
    const count = await service.remindExpiringInvites(
      {
        userId,
        externalSubject: userId,
        displayName: userId,
        authMode: "dev",
      },
      workspaceId,
    );
    return `invite.remind inline notified=${count}`;
  }

  private balancesService(): BalancesService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { BalancesService: S } = require("../balances/balances.service.js") as {
        BalancesService: new (...args: never[]) => BalancesService;
      };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async runSettleRemindJob(
    workspaceId: string,
    actorUserId?: string,
  ): Promise<string> {
    const userId = actorUserId?.trim();
    if (!userId) throw new Error("settle.remind needs meta.actorUserId");
    const service = this.balancesService();
    if (!service) throw new Error("BalancesService not available in this process");
    const result = await service.runSettleRemindSweep(
      {
        userId,
        externalSubject: userId,
        displayName: userId,
        authMode: "dev",
      },
      workspaceId,
    );
    return `settle.remind inline reminded=${result.reminded} skipped=${result.skipped}`;
  }

  private async runThresholdJob(actorUserId?: string, asOfDay?: string): Promise<string> {
    const userId = actorUserId?.trim();
    if (!userId) {
      throw new Error("analytics.threshold needs meta.actorUserId");
    }
    const service = this.personalFinance();
    if (!service) {
      throw new Error("PersonalFinanceService not available in this process");
    }
    const asOf = asOfDay?.trim();
    const result = await service.runThresholdSweep(
      userId,
      asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : undefined,
    );
    return `analytics.threshold inline fired=${result.fired}`;
  }

  private buildingCharges(): BuildingChargesService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { BuildingChargesService: S } = require(
        "../building-charges/building-charges.service.js",
      ) as { BuildingChargesService: new (...args: never[]) => BuildingChargesService };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  private assetsService(): AssetsService | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy class load
      const { AssetsService: S } = require("../assets/assets.service.js") as {
        AssetsService: new (...args: never[]) => AssetsService;
      };
      return this.moduleRef.get(S, { strict: false });
    } catch {
      return undefined;
    }
  }

  private async runAssetsDepreciateJob(
    workspaceId: string,
    meta?: Record<string, string>,
  ): Promise<string> {
    const service = this.assetsService();
    if (!service) {
      throw new Error("AssetsService not available in this process");
    }
    const asOf =
      meta?.asOf?.trim() && /^\d{4}-\d{2}-\d{2}/.test(meta.asOf)
        ? meta.asOf.trim()
        : new Date().toISOString();
    const result = await service.runMonthlyDepreciation(workspaceId, asOf);
    return `assets.depreciate.monthly updated=${result.updated} skipped=${result.skipped}`;
  }

  private async runBuildingChargeJob(
    workspaceId: string,
    meta?: Record<string, string>,
  ): Promise<string> {
    const service = this.buildingCharges();
    if (!service) {
      throw new Error("BuildingChargesService not available in this process");
    }
    const actorUserId = meta?.actorUserId?.trim();
    if (!actorUserId) {
      throw new Error("building.charge.generate needs meta.actorUserId");
    }
    const yearMonth = meta?.yearMonth?.trim();
    const amountMinorPerUnit = meta?.amountMinorPerUnit?.trim();
    if (!yearMonth || !amountMinorPerUnit) {
      throw new Error("building.charge.generate needs meta.yearMonth and amountMinorPerUnit");
    }
    const actor = {
      userId: actorUserId,
      externalSubject: meta?.actorSubject ?? actorUserId,
      displayName: meta?.actorDisplayName ?? actorUserId,
      authMode: "dev" as const,
    };
    const result = await service.generateMonthly(actor, workspaceId, {
      yearMonth,
      amountMinorPerUnit,
      autoPost: meta?.autoPost === "true",
      idempotencyKey:
        meta?.idempotencyKey?.trim() ??
        `job:building-charge:${workspaceId}:${yearMonth}`,
    });
    return `building.charge.generate created=${result.created.length} skipped=${result.skipped.length}`;
  }

  private async runBillingJob(
    name: WorkerJobName,
    workspaceId: string,
    actorUserId?: string,
  ): Promise<string> {
    const service = this.billingMaintenance();
    if (!service) {
      throw new Error("BillingMaintenanceService not available in this process");
    }
    if (!actorUserId) {
      throw new Error("billing jobs need an authorized member as actor");
    }
    if (name === "billing.period.rollover") {
      const result = await service.rollover(workspaceId, actorUserId);
      return `billing.period.rollover opened ${result.openedPeriodIds.length} period(s)`;
    }
    if (name === "billing.invoice.reconcile") {
      const result = await service.reconcile(workspaceId, actorUserId);
      return `billing.invoice.reconcile periods=${result.periodsChecked} members=${result.membersChecked} drift=${result.drift.length} repaired=${result.repaired} adjustments=${result.adjustmentsRaised} ledgerGaps=${result.ledgerGaps.length}`;
    }
    const result = await service.finalizeReminder(workspaceId, actorUserId);
    return `billing.period.finalize.reminder periods=${result.periodIds.length} notified=${result.notified}`;
  }

  async get(jobId: string): Promise<JobRunResult | undefined> {
    const row = await this.runs.get(jobId);
    if (!row) return undefined;
    return { ...row, runsPersistence: this.runs.persistence };
  }

  async listRecent(): Promise<JobRunResult[]> {
    if (!(this.runs instanceof MemoryJobRunStore)) return [];
    const rows = await this.runs.listAll(20);
    return rows.map((r) => ({ ...r, runsPersistence: this.runs.persistence }));
  }

  async listRecentForMember(
    actor: AuthActor,
    workspaceId: string,
  ): Promise<JobRunResult[]> {
    await this.access.requireMember(workspaceId, actor.userId);
    const rows = await this.runs.listForWorkspace(workspaceId, 20);
    return rows.map((r) => ({ ...r, runsPersistence: this.runs.persistence }));
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
    await this.access.requireAccess(workspaceId, actor.userId, "jobs.dlq");
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
