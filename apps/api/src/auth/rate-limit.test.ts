import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindowRateLimit } from "./rate-limit.js";

test("in-memory sliding window allows then blocks", async () => {
  const limiter = new SlidingWindowRateLimit(2, 60_000);
  assert.equal(await limiter.allow("a"), true);
  assert.equal(await limiter.allow("a"), true);
  assert.equal(await limiter.allow("a"), false);
  assert.equal(await limiter.allow("b"), true);
});
