/**
 * File checks for migration 0105 — narrow expense DELETE RLS by status.
 * Does not read .env. Does not apply migrations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0105_expense_delete_status_guard.sql",
);

describe("0105 expense delete status guard", () => {
  it("narrows the three DELETE policies with workspace + draft/reversed guards", () => {
    const raw = readFileSync(migrationPath, "utf8");
    const migration = raw.replace(/--[^\n]*/g, "");
    assert.match(migration, /expense_tenant_delete/);
    assert.match(migration, /expense_split_tenant_delete/);
    assert.match(migration, /expense_payment_tenant_delete/);
    assert.match(
      migration,
      /"workspace_id" = "app"\."current_workspace_id"\(\)/,
    );
    assert.match(migration, /"status" IN \('draft', 'reversed'\)/);
    assert.match(migration, /FROM "finance"\."expense"/);
    assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /CREATE ROLE/i);
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /\bGRANT\b/i);
  });

  it("is registered in the Drizzle journal after 0104", () => {
    const journal = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "migrations/meta/_journal.json"),
        "utf8",
      ),
    );
    const entries = Array.isArray(journal?.entries) ? journal.entries : [];
    const prev = entries.findIndex(
      (entry) => entry?.tag === "0104_expense_purge_delete",
    );
    const next = entries.findIndex(
      (entry) => entry?.tag === "0105_expense_delete_status_guard",
    );
    assert.ok(prev >= 0);
    assert.ok(next > prev);
    assert.ok(entries[next].idx > entries[prev].idx);
  });
});
