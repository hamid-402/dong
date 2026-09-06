import type { Redis } from "ioredis";

export type RateLimiter = {
  allow(key: string): Promise<boolean>;
};

/** Simple in-memory sliding window rate limit (per-process). */
export class SlidingWindowRateLimit implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the key is allowed; records the hit when allowed. */
  allow(key: string): Promise<boolean> {
    const now = Date.now();
    const cut = now - this.windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t >= cut);
    if (prev.length >= this.limit) {
      this.hits.set(key, prev);
      return Promise.resolve(false);
    }
    prev.push(now);
    this.hits.set(key, prev);
    return Promise.resolve(true);
  }
}

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, now .. '-' .. math.random())
redis.call('PEXPIRE', key, windowMs)
return 1
`;

/** Redis sliding-window rate limit (safe across API instances). */
export class RedisSlidingWindowRateLimit implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async allow(key: string): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        `ratelimit:${key}`,
        Date.now(),
        this.windowMs,
        this.limit,
      );
      return result === 1;
    } catch {
      // Availability over strictness: Redis blip must not lock out all logins.
      return true;
    }
  }
}
