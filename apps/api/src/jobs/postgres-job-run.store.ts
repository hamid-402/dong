import { desc, eq } from "@dang/db";
import {
  createDatabase,
  jobRun,
  withTenantContext,
  type AppDatabase,
} from "@dang/db";
import type { WorkerJobName } from "@dang/contracts";
import type {
  JobExecutionMode,
  JobRunFinishInput,
  JobRunRecord,
  JobRunStore,
} from "./job-run.types.js";

function toRecord(row: typeof jobRun.$inferSelect): JobRunRecord {
  return {
    jobId: row.jobId,
    name: row.name as WorkerJobName,
    status: row.status as JobRunRecord["status"],
    execution: row.execution as JobExecutionMode,
    detail: row.detail,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
    lastError: row.lastError ?? undefined,
  };
}

export class PostgresJobRunStore implements JobRunStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresJobRunStore {
    const { db } = createDatabase(url);
    return new PostgresJobRunStore(db);
  }

  async append(run: JobRunRecord): Promise<JobRunRecord> {
    return withTenantContext(
      this.db,
      { workspaceId: run.workspaceId, userId: run.workspaceId },
      async (tx) => {
        const [row] = await tx
          .insert(jobRun)
          .values({
            jobId: run.jobId,
            workspaceId: run.workspaceId,
            name: run.name,
            status: run.status,
            execution: run.execution,
            detail: run.detail,
            createdAt: new Date(run.createdAt),
            finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
            lastError: run.lastError ?? null,
          })
          .onConflictDoNothing()
          .returning();
        return row ? toRecord(row) : run;
      },
    );
  }

  async listForWorkspace(workspaceId: string, limit = 20): Promise<JobRunRecord[]> {
    const capped = Math.max(1, Math.min(limit, 100));
    return withTenantContext(
      this.db,
      { workspaceId, userId: workspaceId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(jobRun)
          .where(eq(jobRun.workspaceId, workspaceId))
          .orderBy(desc(jobRun.createdAt))
          .limit(capped);
        return rows.map(toRecord).reverse();
      },
    );
  }

  async get(jobId: string): Promise<JobRunRecord | undefined> {
    const rows = await this.db.select().from(jobRun).where(eq(jobRun.jobId, jobId)).limit(1);
    const row = rows[0];
    return row ? toRecord(row) : undefined;
  }

  async markFinished(input: JobRunFinishInput): Promise<JobRunRecord | undefined> {
    const finishedAt = new Date(input.finishedAt ?? new Date().toISOString());
    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.workspaceId,
      );

    const patch = {
      status: input.status,
      finishedAt,
      lastError: input.lastError ?? null,
      ...(input.detail ? { detail: input.detail } : {}),
    };

    if (uuidLike) {
      return withTenantContext(
        this.db,
        { workspaceId: input.workspaceId, userId: input.workspaceId },
        async (tx) => {
          const [row] = await tx
            .update(jobRun)
            .set(patch)
            .where(eq(jobRun.jobId, input.jobId))
            .returning();
          return row ? toRecord(row) : undefined;
        },
      );
    }

    // Migrator / BYPASSRLS paths (e.g. system workspace id) — update by job_id only.
    const [row] = await this.db
      .update(jobRun)
      .set(patch)
      .where(eq(jobRun.jobId, input.jobId))
      .returning();
    return row ? toRecord(row) : undefined;
  }
}
