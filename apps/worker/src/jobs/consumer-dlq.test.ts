import assert from "node:assert/strict";
import test from "node:test";
import type { DeadLetterJob, QueuedWorkerJob } from "@dang/contracts";
import { processQueuedJobWithRetries } from "./consumer.js";

const sampleJob: QueuedWorkerJob = {
  jobId: "j-dlq-1",
  name: "webhook.dispatch",
  workspaceId: "ws-1",
  enqueuedAt: "2026-01-01T00:00:00.000Z",
};

test("processQueuedJobWithRetries pushes DLQ shape after exhausted attempts", async () => {
  const pushed: DeadLetterJob[] = [];
  let calls = 0;

  const result = await processQueuedJobWithRetries(sampleJob, {
    maxAttempts: 3,
    process: async () => {
      calls += 1;
      throw new Error("simulated failure");
    },
    pushDlq: async (entry) => {
      pushed.push(entry);
      return true;
    },
  });

  assert.equal(result, "dlq");
  assert.equal(calls, 3);
  assert.equal(pushed.length, 1);
  const entry = pushed[0]!;
  assert.equal(entry.job.jobId, sampleJob.jobId);
  assert.equal(entry.error, "simulated failure");
  assert.equal(entry.attempts, 3);
  assert.ok(entry.failedAt);
});

test("processQueuedJobWithRetries succeeds without DLQ on first success", async () => {
  const pushed: DeadLetterJob[] = [];
  const result = await processQueuedJobWithRetries(sampleJob, {
    maxAttempts: 3,
    process: async () => undefined,
    pushDlq: async (entry) => {
      pushed.push(entry);
      return true;
    },
  });
  assert.equal(result, "ok");
  assert.equal(pushed.length, 0);
});

test("processQueuedJobWithRetries recovers on a later attempt (no DLQ)", async () => {
  const pushed: DeadLetterJob[] = [];
  let calls = 0;

  // Fails on attempts 1 and 2, succeeds on attempt 3 — must NOT reach the DLQ.
  const result = await processQueuedJobWithRetries(sampleJob, {
    maxAttempts: 3,
    process: async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error(`transient failure #${calls}`);
      }
      // third attempt succeeds
    },
    pushDlq: async (entry) => {
      pushed.push(entry);
      return true;
    },
  });

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.equal(pushed.length, 0);
});

test("ledger.rebuild_balances completes with structured result", async () => {
  const { processQueuedJob } = await import("./consumer.js");
  const job: QueuedWorkerJob = {
    jobId: "j-rebuild-1",
    name: "ledger.rebuild_balances",
    workspaceId: "ws-rebuild",
    enqueuedAt: "2026-01-01T00:00:00.000Z",
  };
  const result = await processQueuedJob(job);
  assert.ok(result);
  assert.equal(result.ok, true);
  assert.equal(result.workspaceId, "ws-rebuild");
  assert.equal(result.result.action, "rebuild_balances");
  assert.equal(result.result.mode, "local_ack");
});
