import assert from "node:assert/strict";
import test from "node:test";
import { loadAppEnv, resolveRuntimeDatabaseUrl } from "../src/index.js";

const MIGRATOR_URL = "postgresql://dang_migrator:CHANGE_ME@127.0.0.1:5432/dang";
const RUNTIME_URL = "postgresql://dang_runtime:CHANGE_ME@127.0.0.1:5432/dang";

test("resolveRuntimeDatabaseUrl: DATABASE_URL only → same URL", () => {
  assert.equal(
    resolveRuntimeDatabaseUrl({ DATABASE_URL: MIGRATOR_URL }),
    MIGRATOR_URL,
  );
  const env = loadAppEnv({ DATABASE_URL: MIGRATOR_URL });
  assert.equal(env.databaseUrl, MIGRATOR_URL);
});

test("resolveRuntimeDatabaseUrl: DATABASE_RUNTIME_URL set → runtime wins", () => {
  assert.equal(
    resolveRuntimeDatabaseUrl({
      DATABASE_URL: MIGRATOR_URL,
      DATABASE_RUNTIME_URL: RUNTIME_URL,
    }),
    RUNTIME_URL,
  );
  const env = loadAppEnv({
    DATABASE_URL: MIGRATOR_URL,
    DATABASE_RUNTIME_URL: RUNTIME_URL,
  });
  assert.equal(env.databaseUrl, RUNTIME_URL);
});

test("resolveRuntimeDatabaseUrl: blank DATABASE_RUNTIME_URL falls back", () => {
  assert.equal(
    resolveRuntimeDatabaseUrl({
      DATABASE_URL: MIGRATOR_URL,
      DATABASE_RUNTIME_URL: "   ",
    }),
    MIGRATOR_URL,
  );
  assert.equal(
    resolveRuntimeDatabaseUrl({
      DATABASE_URL: MIGRATOR_URL,
      DATABASE_RUNTIME_URL: "",
    }),
    MIGRATOR_URL,
  );
});
