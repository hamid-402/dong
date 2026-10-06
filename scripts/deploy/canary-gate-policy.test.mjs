/**
 * @fileoverview Unit tests for canary promote policy (no live HTTP).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  readyStatusFailure,
  workerHeartbeatFailure,
} from "./canary-gate-policy.mjs";

test("workerHeartbeatFailure when Redis live and heartbeat dead", () => {
  assert.match(
    workerHeartbeatFailure({
      requireWorker: true,
      redisConfigured: true,
      heartbeatAlive: false,
    }) ?? "",
    /heartbeat dead/,
  );
});

test("workerHeartbeatFailure skips when Redis not configured", () => {
  assert.equal(
    workerHeartbeatFailure({
      requireWorker: true,
      redisConfigured: false,
      heartbeatAlive: false,
    }),
    null,
  );
});

test("readyStatusFailure rejects degraded when requireReady", () => {
  assert.match(
    readyStatusFailure({ requireReady: true, status: "degraded" }) ?? "",
    /want ready/,
  );
});

test("readyStatusFailure allows degraded when requireReady off", () => {
  assert.equal(
    readyStatusFailure({ requireReady: false, status: "degraded" }),
    null,
  );
});
