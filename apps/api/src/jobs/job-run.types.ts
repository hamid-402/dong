import type { WorkerJobName } from "@dang/contracts";

export type JobExecutionMode = "inline_stub" | "redis_queue";

/** Enqueue-time statuses stay until worker write-back (completed/failed). */
export type JobRunStatus = "completed" | "accepted" | "failed";

export type JobRunRecord = {
  jobId: string;
  name: WorkerJobName;
  status: JobRunStatus;
  execution: JobExecutionMode;
  detail: string;
  workspaceId: string;
  createdAt: string;
  finishedAt?: string;
  lastError?: string;
};

export type JobRunFinishInput = {
  jobId: string;
  workspaceId: string;
  status: "completed" | "failed";
  finishedAt?: string;
  lastError?: string;
  detail?: string;
};

export type JobRunStore = {
  readonly persistence: "memory" | "postgres";
  append(run: JobRunRecord): Promise<JobRunRecord>;
  listForWorkspace(workspaceId: string, limit?: number): Promise<JobRunRecord[]>;
  get(jobId: string): Promise<JobRunRecord | undefined>;
  /** Worker / inline completion write-back. No-op when row missing. */
  markFinished(input: JobRunFinishInput): Promise<JobRunRecord | undefined>;
};

export const JOB_RUN_STORE = Symbol("JOB_RUN_STORE");
