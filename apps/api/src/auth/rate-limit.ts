import type { Redis } from "ioredis";
import { loadAppEnv } from "@dang/config";

/** Honest sliding-window counters for response headers. */
export type RateLimitSnapshot = {
  allowed: boolean;
  limit: number;
  /** Requests still allowed in the current window (0 when blocked). */
  remaining: number;
  /** Unix epoch seconds when the oldest hit in the window expires. */
  reset: number;
};

export type RateLimiter = {
  /** Record a hit when allowed; always return honest limit/remaining/reset. */
  consume(key: string): Promise<RateLimitSnapshot>;
  /** Convenience boolean wrapper around consume(). */
  allow(key: string): Promise<boolean>;
};

export type RateLimitHeaderReply = {
  header?: (name: string, value: string) => unknown;
};

/** Apply X-RateLimit-* headers (honest values from consume). */
export function applyRateLimitHeaders(
  reply: RateLimitHeaderReply | null | undefined,
  snapshot: RateLimitSnapshot,
): void {
  if (!reply || typeof reply.header !== "function") return;
  reply.header("X-RateLimit-Limit", String(snapshot.limit));
  reply.header("X-RateLimit-Remaining", String(Math.max(0, snapshot.remaining)));
  reply.header("X-RateLimit-Reset", String(snapshot.reset));
}

/** Problem+JSON body fragment so the exception filter can set the same headers on 429. */
export function rateLimitProblemFields(snapshot: RateLimitSnapshot) {
  return {
    rateLimit: {
      limit: snapshot.limit,
      remaining: snapshot.remaining,
      reset: snapshot.reset,
    },
  };
}

function resetUnixFromOldestMs(oldestMs: number, windowMs: number, now: number): number {
  const base = Number.isFinite(oldestMs) ? oldestMs : now;
  return Math.ceil((base + windowMs) / 1000);
}

/** Simple in-memory sliding window rate limit (per-process). */
export class SlidingWindowRateLimit implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<RateLimitSnapshot> {
    const now = Date.now();
    const cut = now - this.windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t >= cut);
    const reset = resetUnixFromOldestMs(prev[0] ?? now, this.windowMs, now);
    if (prev.length >= this.limit) {
      this.hits.set(key, prev);
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        reset,
      };
    }
    prev.push(now);
    this.hits.set(key, prev);
    return {
      allowed: true,
      limit: this.limit,
      remaining: Math.max(0, this.limit - prev.length),
      reset: resetUnixFromOldestMs(prev[0]!, this.windowMs, now),
    };
  }

  /** Returns true if the key is allowed; records the hit when allowed. */
  allow(key: string): Promise<boolean> {
    return this.consume(key).then((s) => s.allowed);
  }
}

/** Returns [allowed(0|1), limit, remaining, resetMs] */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetMs = now + windowMs
if oldest[2] then
  resetMs = tonumber(oldest[2]) + windowMs
end
if count >= limit then
  return {0, limit, 0, resetMs}
end
redis.call('ZADD', key, now, now .. '-' .. math.random())
redis.call('PEXPIRE', key, windowMs)
local newCount = count + 1
return {1, limit, math.max(0, limit - newCount), resetMs}
`;

export type RedisRateLimitOptions = {
  /** When true, Redis errors deny the request (auth production posture). */
  failClosed?: boolean;
};

/** Redis sliding-window rate limit (safe across API instances). */
export class RedisSlidingWindowRateLimit implements RateLimiter {
  private readonly failClosed: boolean;

  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowMs: number,
    options?: RedisRateLimitOptions,
  ) {
    const env = loadAppEnv();
    this.failClosed =
      options?.failClosed ??
      (env.nodeEnv === "production" || Boolean(process.env.REDIS_URL));
  }

  async consume(key: string): Promise<RateLimitSnapshot> {
    const now = Date.now();
    const denyClosed = (): RateLimitSnapshot => ({
      allowed: false,
      limit: this.limit,
      remaining: 0,
      reset: Math.ceil((now + this.windowMs) / 1000),
    });
    try {
      const result = (await this.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        `ratelimit:${key}`,
        now,
        this.windowMs,
        this.limit,
      )) as [number, number, number, number];
      const allowed = Number(result[0]) === 1;
      const limit = Number(result[1]) || this.limit;
      const remaining = Number(result[2]);
      const resetMs = Number(result[3]) || now + this.windowMs;
      return {
        allowed,
        limit,
        remaining: Math.max(0, remaining),
        reset: Math.ceil(resetMs / 1000),
      };
    } catch {
      if (this.failClosed) {
        console.warn(
          JSON.stringify({
            level: "warn",
            service: "dang-api",
            message: "rate-limit fail-closed: Redis error denied request",
            keyPrefix: key.split(":")[0] ?? "unknown",
          }),
        );
        return denyClosed();
      }
      return {
        allowed: true,
        limit: this.limit,
        remaining: this.limit,
        reset: Math.ceil((now + this.windowMs) / 1000),
      };
    }
  }

  async allow(key: string): Promise<boolean> {
    return (await this.consume(key)).allowed;
  }
}
