/**
 * File checks for the NOLOGIN dang_rls_probe role in the CI bootstrap.
 * Does not read .env. Does not connect to a database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const bootstrapPath = resolve(process.cwd(), "scripts/ci-bootstrap-runtime.sql");

describe("dang_rls_probe bootstrap", () => {
  it("creates a NOLOGIN probe and grants SET without inheriting runtime DML", () => {
    const sql = readFileSync(bootstrapPath, "utf8");
    const probeAt = sql.indexOf("CREATE ROLE dang_rls_probe");
    assert.ok(probeAt > 0);
    const probeBlock = sql.slice(probeAt, probeAt + 400);
    assert.match(probeBlock, /NOLOGIN/);
    assert.match(probeBlock, /NOBYPASSRLS/);
    assert.match(probeBlock, /NOINHERIT/);
    assert.doesNotMatch(probeBlock, /PASSWORD/i);
    assert.match(sql, /rolcreaterole/);
    assert.match(
      sql,
      /GRANT dang_runtime TO dang_rls_probe WITH INHERIT FALSE, SET TRUE/,
    );
    assert.match(
      sql,
      /GRANT dang_runtime TO dang_migrator WITH INHERIT FALSE, SET TRUE/,
    );
    assert.doesNotMatch(sql, /GRANT dang_rls_probe LOGIN/i);
  });
});
