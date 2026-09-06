import assert from "node:assert/strict";
import test from "node:test";
import {
  DANG_JOB_DLQ_KEY,
  DANG_JOB_QUEUE_KEY,
  DANG_WORKER_HEARTBEAT_KEY,
} from "../src/jobs.js";

test("job queue keys are stable for API/worker contract", () => {
  assert.equal(DANG_JOB_QUEUE_KEY, "dang:jobs:v1");
  assert.equal(DANG_JOB_DLQ_KEY, "dang:jobs:dlq:v1");
  assert.equal(DANG_WORKER_HEARTBEAT_KEY, "dang:worker:heartbeat");
});
