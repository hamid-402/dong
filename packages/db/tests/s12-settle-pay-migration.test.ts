import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("0087 adds journal occurred_on and gift movement kind", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "migrations/0087_s12_settle_pay_gift.sql"),
    "utf8",
  );
  assert.match(migration, /occurred_on/);
  assert.match(migration, /journal_entry_workspace_occurred_idx/);
  assert.match(migration, /DISABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /petty_cash_movement_kind.*ADD VALUE IF NOT EXISTS 'gift'/s,
  );
});

test("0087 is registered in the Drizzle migration journal", () => {
  const journal = readFileSync(
    resolve(process.cwd(), "migrations/meta/_journal.json"),
    "utf8",
  );
  assert.match(journal, /0087_s12_settle_pay_gift/);
  assert.match(journal, /0086_workspace_webhook_delivery/);
});
