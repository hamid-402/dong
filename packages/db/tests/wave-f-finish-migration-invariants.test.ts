import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Wave F finish money tables are tenant isolated and FX is explicitly global", () => {
  const sql = readFileSync(resolve(process.cwd(), "migrations/0038_wave_f_finish_infra.sql"), "utf8");
  for (const table of ["reimbursement_request", "category_budget", "approval_workflow_step"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "finance"\\."${table}"`));
    assert.match(sql, new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON finance\\.${table}`));
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /app\.current_workspace_id\(\)/);
  assert.match(sql, /Global system rate table; intentionally not tenant-RLS/);
  assert.match(sql, /GRANT SELECT, INSERT ON finance\.fx_rate/);
});

test("0038 is registered in the Drizzle migration journal", () => {
  const journal = readFileSync(resolve(process.cwd(), "migrations/meta/_journal.json"), "utf8");
  assert.match(journal, /"tag": "0038_wave_f_finish_infra"/);
});
