import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersistenceStore,
  requiresPostgres,
} from "./postgres-store.factory.js";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

test("requiresPostgres when DATABASE_URL set or DANG_REQUIRE_POSTGRES=1", () => {
  assert.equal(requiresPostgres(undefined, {}), false);
  assert.equal(requiresPostgres("  ", {}), false);
  assert.equal(requiresPostgres("postgres://x", {}), true);
  assert.equal(requiresPostgres(undefined, { DANG_REQUIRE_POSTGRES: "1" }), true);
});

test("createPersistenceStore uses memory only when DATABASE_URL unset", () => {
  const store = createPersistenceStore({
    name: "test store",
    databaseUrl: undefined,
    logger: silentLogger,
    env: {},
    createPostgres: () => "pg",
    createMemory: () => "mem",
  });
  assert.equal(store, "mem");
});

test("createPersistenceStore refuses memory when DANG_REQUIRE_POSTGRES=1 without URL", () => {
  assert.throws(
    () =>
      createPersistenceStore({
        name: "test store",
        databaseUrl: undefined,
        logger: silentLogger,
        env: { DANG_REQUIRE_POSTGRES: "1" },
        createPostgres: () => "pg",
        createMemory: () => "mem",
      }),
    /DANG_REQUIRE_POSTGRES=1/,
  );
});

test("createPersistenceStore fails closed when Postgres init throws", () => {
  assert.throws(
    () =>
      createPersistenceStore({
        name: "test store",
        databaseUrl: "postgres://example",
        logger: silentLogger,
        env: {},
        createPostgres: () => {
          throw new Error("boom");
        },
        createMemory: () => "mem",
      }),
    /boom/,
  );
});
