import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadiness } from "./readiness.js";

test("evaluateReadiness is ready when nothing required and deps unset", async () => {
  const prevPg = process.env.DANG_REQUIRE_POSTGRES;
  const prevRedis = process.env.DANG_REQUIRE_REDIS;
  delete process.env.DANG_REQUIRE_POSTGRES;
  delete process.env.DANG_REQUIRE_REDIS;
  try {
    const snap = await evaluateReadiness({
      iamPersistence: "memory",
      env: {
        nodeEnv: "test",
        databaseUrl: undefined,
        redisUrl: undefined,
      } as never,
    });
    assert.equal(snap.status, "ready");
    assert.equal(snap.checks.database, "skip");
    assert.equal(snap.checks.redis, "skip");
    assert.equal(snap.checks.requirePostgres, false);
  } finally {
    if (prevPg === undefined) delete process.env.DANG_REQUIRE_POSTGRES;
    else process.env.DANG_REQUIRE_POSTGRES = prevPg;
    if (prevRedis === undefined) delete process.env.DANG_REQUIRE_REDIS;
    else process.env.DANG_REQUIRE_REDIS = prevRedis;
  }
});

test("evaluateReadiness degrades when DANG_REQUIRE_POSTGRES=1 and iam is memory", async () => {
  const prev = process.env.DANG_REQUIRE_POSTGRES;
  process.env.DANG_REQUIRE_POSTGRES = "1";
  try {
    const snap = await evaluateReadiness({
      iamPersistence: "memory",
      env: {
        nodeEnv: "test",
        databaseUrl: undefined,
        redisUrl: undefined,
      } as never,
    });
    assert.equal(snap.status, "degraded");
    assert.equal(snap.checks.requirePostgres, true);
    assert.equal(snap.checks.iam, "memory");
  } finally {
    if (prev === undefined) delete process.env.DANG_REQUIRE_POSTGRES;
    else process.env.DANG_REQUIRE_POSTGRES = prev;
  }
});
