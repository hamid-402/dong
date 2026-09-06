import assert from "node:assert/strict";
import test from "node:test";
import {
  DANG_JOB_DLQ_KEY,
  DANG_JOB_QUEUE_KEY,
  buildDeadLetterJob,
  type QueuedWorkerJob,
} from "../src/jobs.js";

test("DLQ key is stable and distinct from main queue", () => {
  assert.equal(DANG_JOB_DLQ_KEY, "dang:jobs:dlq:v1");
  assert.notEqual(DANG_JOB_DLQ_KEY, DANG_JOB_QUEUE_KEY);
});

test("buildDeadLetterJob shape matches { job, error, attempts, failedAt }", () => {
  const job: QueuedWorkerJob = {
    jobId: "job-1",
    name: "report.export",
    workspaceId: "ws-1",
    enqueuedAt: "2026-01-01T00:00:00.000Z",
  };
  const failedAt = "2026-01-01T00:01:00.000Z";
  const entry = buildDeadLetterJob(job, new Error("boom"), 3, failedAt);

  assert.deepEqual(Object.keys(entry).sort(), ["attempts", "error", "failedAt", "job"]);
  assert.equal(entry.job.jobId, "job-1");
  assert.equal(entry.error, "boom");
  assert.equal(entry.attempts, 3);
  assert.equal(entry.failedAt, failedAt);

  const asJson = JSON.parse(JSON.stringify(entry));
  assert.equal(asJson.error, "boom");
  assert.equal(asJson.attempts, 3);
  assert.ok(asJson.job);
});

test("buildDeadLetterJob stringifies non-Error failures", () => {
  const job: QueuedWorkerJob = {
    jobId: "job-2",
    name: "notify.email",
    workspaceId: "ws-2",
    enqueuedAt: "2026-01-01T00:00:00.000Z",
  };
  const entry = buildDeadLetterJob(job, "plain fail", 3, "2026-01-02T00:00:00.000Z");
  assert.equal(entry.error, "plain fail");
});
