import assert from "node:assert/strict";
import test from "node:test";
import {
  RedisSlidingWindowRateLimit,
  SlidingWindowRateLimit,
  applyRateLimitHeaders,
} from "./rate-limit.js";

test("in-memory sliding window allows then blocks with honest remaining", async () => {
  const limiter = new SlidingWindowRateLimit(2, 60_000);
  const a1 = await limiter.consume("a");
  assert.equal(a1.allowed, true);
  assert.equal(a1.limit, 2);
  assert.equal(a1.remaining, 1);
  assert.ok(a1.reset > 0);
  const a2 = await limiter.consume("a");
  assert.equal(a2.allowed, true);
  assert.equal(a2.remaining, 0);
  const a3 = await limiter.consume("a");
  assert.equal(a3.allowed, false);
  assert.equal(a3.remaining, 0);
  assert.equal(await limiter.allow("b"), true);
});

test("applyRateLimitHeaders writes X-RateLimit-*", () => {
  const headers: Record<string, string> = {};
  applyRateLimitHeaders(
    {
      header: (name, value) => {
        headers[name] = value;
      },
    },
    { allowed: true, limit: 20, remaining: 19, reset: 1_700_000_000 },
  );
  assert.equal(headers["X-RateLimit-Limit"], "20");
  assert.equal(headers["X-RateLimit-Remaining"], "19");
  assert.equal(headers["X-RateLimit-Reset"], "1700000000");
});

test("redis rate limit fail-closed denies on redis error", async () => {
  const fakeRedis = {
    eval: async () => {
      throw new Error("redis down");
    },
  };
  const limiter = new RedisSlidingWindowRateLimit(fakeRedis as never, 10, 60_000, {
    failClosed: true,
  });
  const snap = await limiter.consume("login:x");
  assert.equal(snap.allowed, false);
  assert.equal(snap.remaining, 0);
});

test("redis rate limit fail-open allows on redis error when configured", async () => {
  const fakeRedis = {
    eval: async () => {
      throw new Error("redis down");
    },
  };
  const limiter = new RedisSlidingWindowRateLimit(fakeRedis as never, 10, 60_000, {
    failClosed: false,
  });
  assert.equal(await limiter.allow("login:x"), true);
});
