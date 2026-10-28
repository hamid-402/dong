import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDbRoleCheck,
  EXPECTED_RUNTIME_ROLE,
  isDbRoleStrict,
} from "./db-role-probe.js";
import { evaluateReadiness } from "./readiness.js";

test("evaluateDbRoleCheck: dang_runtime NOBYPASSRLS → ok", () => {
  const check = evaluateDbRoleCheck(
    {
      currentUser: EXPECTED_RUNTIME_ROLE,
      rolsuper: false,
      rolbypassrls: false,
    },
    { configured: true, strict: false },
  );
  assert.equal(check.status, "ok");
});

test("without DB_ROLE_STRICT → inappropriate role is warn only", () => {
  const check = evaluateDbRoleCheck(
    {
      currentUser: "dang_migrator",
      rolsuper: false,
      rolbypassrls: true,
    },
    { configured: true, strict: false },
  );
  assert.equal(check.status, "warn");
  assert.match(check.reason ?? "", /bypassrls/);
});

test("with DB_ROLE_STRICT → inappropriate role is fail", () => {
  const check = evaluateDbRoleCheck(
    {
      currentUser: "dang_migrator",
      rolsuper: false,
      rolbypassrls: true,
    },
    { configured: true, strict: true },
  );
  assert.equal(check.status, "fail");
});

test("evaluateReadiness without DB_ROLE_STRICT: warn does not degrade", async () => {
  const prevStrict = process.env.DB_ROLE_STRICT;
  const prevPg = process.env.DANG_REQUIRE_POSTGRES;
  const prevRedis = process.env.DANG_REQUIRE_REDIS;
  delete process.env.DB_ROLE_STRICT;
  delete process.env.DANG_REQUIRE_POSTGRES;
  delete process.env.DANG_REQUIRE_REDIS;
  try {
    assert.equal(isDbRoleStrict(), false);
    const snap = await evaluateReadiness({
      iamPersistence: "memory",
      env: {
        nodeEnv: "test",
        databaseUrl: "postgresql://dang_runtime:CHANGE_ME@127.0.0.1:5432/dang",
        redisUrl: undefined,
        cookieSecure: false,
      } as never,
      dbRoleProbe: {
        currentUser: "dang_migrator",
        rolsuper: false,
        rolbypassrls: true,
      },
      skipLiveDbRoleProbe: true,
      skipLiveDatabasePing: true,
    });
    assert.equal(snap.checks.dbRole, "warn");
    assert.equal(snap.checks.dbRoleStrict, false);
    assert.equal(snap.status, "ready");
  } finally {
    if (prevStrict === undefined) delete process.env.DB_ROLE_STRICT;
    else process.env.DB_ROLE_STRICT = prevStrict;
    if (prevPg === undefined) delete process.env.DANG_REQUIRE_POSTGRES;
    else process.env.DANG_REQUIRE_POSTGRES = prevPg;
    if (prevRedis === undefined) delete process.env.DANG_REQUIRE_REDIS;
    else process.env.DANG_REQUIRE_REDIS = prevRedis;
  }
});

test("evaluateReadiness with DB_ROLE_STRICT=1 and bad role → degraded/fail", async () => {
  const prevStrict = process.env.DB_ROLE_STRICT;
  const prevPg = process.env.DANG_REQUIRE_POSTGRES;
  const prevRedis = process.env.DANG_REQUIRE_REDIS;
  process.env.DB_ROLE_STRICT = "1";
  delete process.env.DANG_REQUIRE_POSTGRES;
  delete process.env.DANG_REQUIRE_REDIS;
  try {
    const snap = await evaluateReadiness({
      iamPersistence: "memory",
      env: {
        nodeEnv: "test",
        databaseUrl: "postgresql://dang_runtime:CHANGE_ME@127.0.0.1:5432/dang",
        redisUrl: undefined,
        cookieSecure: false,
      } as never,
      dbRoleProbe: {
        currentUser: "postgres",
        rolsuper: true,
        rolbypassrls: true,
      },
      skipLiveDbRoleProbe: true,
      skipLiveDatabasePing: true,
    });
    assert.equal(snap.checks.dbRole, "fail");
    assert.equal(snap.checks.dbRoleStrict, true);
    assert.equal(snap.status, "degraded");
  } finally {
    if (prevStrict === undefined) delete process.env.DB_ROLE_STRICT;
    else process.env.DB_ROLE_STRICT = prevStrict;
    if (prevPg === undefined) delete process.env.DANG_REQUIRE_POSTGRES;
    else process.env.DANG_REQUIRE_POSTGRES = prevPg;
    if (prevRedis === undefined) delete process.env.DANG_REQUIRE_REDIS;
    else process.env.DANG_REQUIRE_REDIS = prevRedis;
  }
});
