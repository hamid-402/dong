import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Wave F money tables force tenant RLS and grants", () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "migrations/0037_wave_f_guest_allowance_policy.sql",
    ),
    "utf8",
  );
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'guest'/);
  for (const table of ["member_allowance", "workspace_expense_policy"]) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS "finance"\\."${table}"`),
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE "finance"\\."${table}" FORCE ROW LEVEL SECURITY`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON finance\\.${table}`,
      ),
    );
  }
  assert.match(migration, /CREATE POLICY "member_allowance_tenant_all"/);
  assert.match(migration, /CREATE POLICY "workspace_expense_policy_tenant_all"/);
});
