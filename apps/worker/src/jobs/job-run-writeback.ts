import { createLogger } from "@dang/observability";
import { eq } from "@dang/db";
import { createDatabase, jobRun, withTenantContext } from "@dang/db";
import { loadAppEnv } from "@dang/config";

const logger = createLogger("dang-worker-job-run");

export type JobRunWriteBackInput = {
  jobId: string;
  workspaceId: string;
  status: "completed" | "failed";
  lastError?: string;
  detail?: string;
};

/**
 * Best-effort write-back to ops.job_run when DATABASE_URL is set.
 * Skips silently when unset or on any failure (enqueue-time row remains).
 */
export async function writeBackJobRun(input: JobRunWriteBackInput): Promise<void> {
  const url = loadAppEnv().databaseUrl?.trim();
  if (!url) return;

  const finishedAt = new Date();
  const patch = {
    status: input.status,
    finishedAt,
    lastError: input.lastError?.slice(0, 2000) ?? null,
    ...(input.detail ? { detail: input.detail } : {}),
  };

  try {
    const { db, close } = createDatabase(url);
    try {
      const uuidLike =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input.workspaceId,
        );

      if (uuidLike) {
        await withTenantContext(
          db,
          { workspaceId: input.workspaceId, userId: input.workspaceId },
          async (tx) => {
            await tx.update(jobRun).set(patch).where(eq(jobRun.jobId, input.jobId));
          },
        );
      } else {
        await db.update(jobRun).set(patch).where(eq(jobRun.jobId, input.jobId));
      }
    } finally {
      await close();
    }
  } catch (err: unknown) {
    logger.warn("job_run write-back skipped", {
      jobId: input.jobId,
      detail: err instanceof Error ? err.message || err.name : String(err),
    });
  }
}
