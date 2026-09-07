import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("Wave 6 financial table ships with forced RLS and BI remains a view", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "migrations/0036_wave6_bi_cost_center_audience.sql"),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS "finance"\."cost_center"/);
  assert.match(migration, /ALTER TABLE "finance"\."cost_center" FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY "cost_center_tenant_all"/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON finance\.cost_center/);
  assert.match(migration, /CREATE OR REPLACE VIEW "finance"\."v_expense_posted_monthly"/);
  assert.doesNotMatch(migration, /CREATE\s+MATERIALIZED\s+VIEW/i);
});
