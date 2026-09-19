import type { RateLimiter, RateLimitSnapshot } from "./rate-limit.js";
import { RedisSlidingWindowRateLimit, SlidingWindowRateLimit } from "./rate-limit.js";
import { getRedisClient } from "../jobs/redis-queue.js";
import { isRedisConfigured, loadAppEnv } from "@dang/config";

/**
 * Named adaptive classes — prefer these over ad-hoc limits for product paths.
 *
 * | class          | default | window | intended use                          |
 * |----------------|---------|--------|---------------------------------------|
 * | finance-write  | 30      | 60s    | expense / settlement / payment mutations |
 * | finance-read   | 120     | 60s    | list/get finance reads                |
 * | auth-sensitive | 20      | 15m    | login / register / MFA verify         |
 * | directory-read | 40      | 15m    | username / phone directory lookup     |
 */
export const RATE_LIMIT_CLASSES = {
  "finance-write": { limit: 30, windowMs: 60_000 },
  "finance-read": { limit: 120, windowMs: 60_000 },
  "auth-sensitive": { limit: 20, windowMs: 15 * 60_000 },
  "directory-read": { limit: 40, windowMs: 15 * 60_000 },
} as const;

export type RateLimitClassName = keyof typeof RATE_LIMIT_CLASSES;

/** Create a limiter from a documented class (Redis when configured). */
export function createClassRateLimit(className: RateLimitClassName): RateLimiter {
  const cfg = RATE_LIMIT_CLASSES[className];
  return createAdaptiveRateLimit(cfg.limit, cfg.windowMs);
}

/**
 * Prefer Redis when configured; fall back to in-memory when Redis is unset.
 * Auth limiters use fail-closed Redis errors in production or when Redis is configured.
 */
export function createAdaptiveRateLimit(limit: number, windowMs: number): RateLimiter {
  let backend: RateLimiter = new SlidingWindowRateLimit(limit, windowMs);
  let upgraded = false;
  let warnedDegraded = false;
  const env = loadAppEnv();
  const failClosed = env.nodeEnv === "production" || isRedisConfigured(env);

  const denyClosed = (): RateLimitSnapshot => ({
    allowed: false,
    limit,
    remaining: 0,
    reset: Math.ceil((Date.now() + windowMs) / 1000),
  });

  async function ensureBackend(): Promise<RateLimitSnapshot | null> {
    if (upgraded || !isRedisConfigured(loadAppEnv())) return null;
    const redis = await getRedisClient();
    if (redis) {
      backend = new RedisSlidingWindowRateLimit(redis, limit, windowMs, {
        failClosed,
      });
      upgraded = true;
      return null;
    }
    if (!warnedDegraded) {
      warnedDegraded = true;
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "dang-api",
          message: failClosed
            ? "rate-limit: Redis configured but unavailable; denying until Redis recovers"
            : "rate-limit degraded: Redis configured but unavailable; using in-memory",
        }),
      );
    }
    if (failClosed) return denyClosed();
    return null;
  }

  return {
    async consume(key: string): Promise<RateLimitSnapshot> {
      const denied = await ensureBackend();
      if (denied) return denied;
      return backend.consume(key);
    },
    async allow(key: string): Promise<boolean> {
      return (await this.consume(key)).allowed;
    },
  };
}
