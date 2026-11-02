/**
 * File checks for migration 0099 — dang_migrator policies mirroring 0098.
 * Does not read .env. Does not apply migrations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "migrations/0099_pending_psp_migrator_policies.sql",
);

describe("0099 pending PSP migrator policies file checks", () => {
  it("mirrors dang_runtime policies for dang_migrator with SELECT/INSERT/UPDATE only", () => {
    const raw = readFileSync(migrationPath, "utf8");
    const migration = raw.replace(/--[^\n]*/g, "");
    assert.match(migration, /pending_local_psp_dang_migrator/);
    assert.match(migration, /pending_zarinpal_dang_migrator/);
    assert.match(migration, /TO dang_migrator/);
    assert.match(migration, /app\.local_psp_intent_id/);
    assert.match(migration, /app\.zarinpal_authority/);
    assert.match(
      migration,
      /GRANT SELECT, INSERT, UPDATE ON finance\.pending_local_psp_payment TO dang_migrator/,
    );
    assert.match(
      migration,
      /GRANT SELECT, INSERT, UPDATE ON finance\.pending_zarinpal_payment TO dang_migrator/,
    );
    assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /payee_user_id/);
    assert.doesNotMatch(migration, /ON DELETE RESTRICT/i);
    assert.doesNotMatch(migration, /\bGRANT\s+DELETE\b/i);
    assert.doesNotMatch(migration, /dang_runtime/);
  });

  it("is registered in the Drizzle migration journal after 0098", () => {
    const journal = readFileSync(
      resolve(process.cwd(), "migrations/meta/_journal.json"),
      "utf8",
    );
    assert.match(journal, /0098_pending_psp_rls/);
    assert.match(journal, /0099_pending_psp_migrator_policies/);
  });

  it("orders 0099 after 0098 by tag in _journal.json", () => {
    const journal = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "migrations/meta/_journal.json"),
        "utf8",
      ),
    );
    const entries = Array.isArray(journal?.entries) ? journal.entries : [];
    const tag0098 = "0098_pending_psp_rls";
    const tag0099 = "0099_pending_psp_migrator_policies";
    const index0098 = entries.findIndex((e) => e?.tag === tag0098);
    const index0099 = entries.findIndex((e) => e?.tag === tag0099);
    assert.ok(index0098 >= 0, `missing journal tag ${tag0098}`);
    assert.ok(index0099 >= 0, `missing journal tag ${tag0099}`);
    assert.ok(
      index0099 > index0098,
      `${tag0099} must appear after ${tag0098} in journal entries`,
    );
    const idx0098 = entries[index0098].idx;
    const idx0099 = entries[index0099].idx;
    if (typeof idx0098 === "number" && typeof idx0099 === "number") {
      assert.ok(idx0099 > idx0098, `${tag0099} idx must be greater than ${tag0098}`);
    }
  });
});
