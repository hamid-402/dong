/**
 * File checks for migration 0104 — runtime DELETE for expense purge.
 * Does not read .env. Does not apply migrations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0104_expense_purge_delete.sql",
);

describe("0104 expense purge delete grant", () => {
  it("adds tenant DELETE policies and a runtime DELETE grant only", () => {
    const raw = readFileSync(migrationPath, "utf8");
    const migration = raw.replace(/--[^\n]*/g, "");
    assert.match(migration, /expense_tenant_delete/);
    assert.match(migration, /expense_split_tenant_delete/);
    assert.match(migration, /expense_payment_tenant_delete/);
    assert.match(
      migration,
      /USING \("workspace_id" = "app"\."current_workspace_id"\(\)\)/,
    );
    assert.match(migration, /GRANT DELETE ON finance\.expense TO dang_runtime/);
    assert.match(
      migration,
      /GRANT DELETE ON finance\.expense_split_line TO dang_runtime/,
    );
    assert.match(
      migration,
      /GRANT DELETE ON finance\.expense_payment_line TO dang_runtime/,
    );
    assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /CREATE ROLE/i);
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /finance\.settlement/);
  });

  it("is registered in the Drizzle journal after 0103", () => {
    const journal = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "migrations/meta/_journal.json"),
        "utf8",
      ),
    );
    const entries = Array.isArray(journal?.entries) ? journal.entries : [];
    const prev = entries.findIndex(
      (entry) => entry?.tag === "0103_catalog_rls_runtime_grants",
    );
    const next = entries.findIndex(
      (entry) => entry?.tag === "0104_expense_purge_delete",
    );
    assert.ok(prev >= 0);
    assert.ok(next > prev);
    assert.ok(entries[next].idx > entries[prev].idx);
  });
});
