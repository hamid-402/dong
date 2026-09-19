import type { JobRunFinishInput, JobRunRecord, JobRunStore } from "./job-run.types.js";

export class MemoryJobRunStore implements JobRunStore {
  readonly persistence = "memory" as const;
  private readonly runs: JobRunRecord[] = [];

  async append(run: JobRunRecord): Promise<JobRunRecord> {
    this.runs.push(run);
    if (this.runs.length > 500) this.runs.splice(0, this.runs.length - 500);
    return run;
  }

  async listForWorkspace(workspaceId: string, limit = 20): Promise<JobRunRecord[]> {
    const capped = Math.max(1, Math.min(limit, 100));
    return this.runs.filter((r) => r.workspaceId === workspaceId).slice(-capped);
  }

  async listAll(limit = 20): Promise<JobRunRecord[]> {
    const capped = Math.max(1, Math.min(limit, 100));
    return this.runs.slice(-capped);
  }

  async get(jobId: string): Promise<JobRunRecord | undefined> {
    return this.runs.find((r) => r.jobId === jobId);
  }

  async markFinished(input: JobRunFinishInput): Promise<JobRunRecord | undefined> {
    const row = this.runs.find((r) => r.jobId === input.jobId);
    if (!row) return undefined;
    row.status = input.status;
    row.finishedAt = input.finishedAt ?? new Date().toISOString();
    row.lastError = input.lastError;
    if (input.detail) row.detail = input.detail;
    return row;
  }
}
