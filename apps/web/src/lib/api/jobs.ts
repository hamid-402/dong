import type { DeadLetterJob, WorkerJobName } from "@dang/contracts";
import { apiFetch } from "./client";

export type JobRunResultDto = {
  jobId: string;
  name: WorkerJobName;
  status: "completed" | "accepted" | "failed";
  execution: "inline_stub" | "redis_queue";
  detail: string;
  workspaceId?: string;
  createdAt: string;
  finishedAt?: string;
  lastError?: string;
  runsPersistence?: "memory" | "postgres";
};

export type DlqListResultDto = {
  length: number;
  items: DeadLetterJob[];
  redis: true;
};

export type DlqReplayResultDto = {
  replayed: DeadLetterJob | null;
  remaining: number | null;
};

/** Workspace jobs + DLQ — only meaningful when capabilities.providers.jobs is redis_queue. */
export const jobsApi = {
  runJob: (workspaceId: string, name: WorkerJobName) =>
    apiFetch<JobRunResultDto>(`/workspaces/${workspaceId}/jobs`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  listRecentJobs: (workspaceId: string) =>
    apiFetch<JobRunResultDto[]>(`/workspaces/${workspaceId}/jobs`),
  listDlq: (workspaceId: string, limit = 50) =>
    apiFetch<DlqListResultDto>(
      `/workspaces/${workspaceId}/jobs/dlq?limit=${encodeURIComponent(String(limit))}`,
    ),
  replayDlq: (workspaceId: string) =>
    apiFetch<DlqReplayResultDto>(`/workspaces/${workspaceId}/jobs/dlq/replay`, {
      method: "POST",
      body: "{}",
    }),
};
