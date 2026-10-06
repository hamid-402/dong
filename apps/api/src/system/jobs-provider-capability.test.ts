import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveJobsProviderCapability } from "./system.controller.js";

describe("resolveJobsProviderCapability", () => {
  it("returns inline_stub without Redis", () => {
    assert.equal(
      resolveJobsProviderCapability({
        redisConfigured: false,
        workerAlive: false,
      }),
      "inline_stub",
    );
  });

  it("returns redis_queue when worker alive", () => {
    assert.equal(
      resolveJobsProviderCapability({
        redisConfigured: true,
        workerAlive: true,
      }),
      "redis_queue",
    );
  });

  it("returns redis_queue_degraded when Redis up and worker dead", () => {
    assert.equal(
      resolveJobsProviderCapability({
        redisConfigured: true,
        workerAlive: false,
      }),
      "redis_queue_degraded",
    );
  });
});
