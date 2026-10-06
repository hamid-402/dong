/**
 * Pure canary promote/hold policy (Phase 5.8).
 * Shared by canary-gate.mjs and unit tests — no network.
 */

export function workerHeartbeatFailure(input) {
  if (input.requireWorker && input.redisConfigured && !input.heartbeatAlive) {
    return "worker heartbeat dead while Redis configured (integrationsReady.workerConsumer)";
  }
  return null;
}

export function readyStatusFailure(input) {
  if (!input.status) return "health/ready missing status";
  if (input.requireReady && input.status !== "ready") {
    return `health/ready status=${input.status} (want ready)`;
  }
  if (input.status !== "ready" && input.status !== "degraded") {
    return "health/ready unexpected body";
  }
  return null;
}
