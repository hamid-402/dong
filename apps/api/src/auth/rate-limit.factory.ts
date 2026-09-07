import type { RateLimiter } from "./rate-limit.js";
import { RedisSlidingWindowRateLimit, SlidingWindowRateLimit } from "./rate-limit.js";
import { getRedisClient } from "../jobs/redis-queue.js";
import { isRedisConfigured, loadAppEnv } from "@dang/config";

/**
 * Prefer Redis when configured; fall back to in-memory (dev / Redis down).
 * Lazily upgrades the backing limiter after first Redis success.
 * Emits a warn once when Redis is configured but unavailable (degraded mode).
 */
export function createAdaptiveRateLimit(limit: number, windowMs: number): RateLimiter {
  let backend: RateLimiter = new SlidingWindowRateLimit(limit, windowMs);
  let upgraded = false;
  let warnedDegraded = false;

  return {
    async allow(key: string): Promise<boolean> {
      if (!upgraded && isRedisConfigured(loadAppEnv())) {
        const redis = await getRedisClient();
        if (redis) {
          backend = new RedisSlidingWindowRateLimit(redis, limit, windowMs);
          upgraded = true;
        } else if (!warnedDegraded) {
          warnedDegraded = true;
          console.warn(
            JSON.stringify({
              level: "warn",
              service: "dang-api",
              message: "rate-limit degraded: Redis configured but unavailable; using in-memory",
            }),
          );
        }
      }
      return backend.allow(key);
    },
  };
}
