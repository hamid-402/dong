import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("0097 recreates payee_fund workspace FK with ON DELETE RESTRICT", () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "migrations/0097_payment_receipt_payee_fund_fk_restrict.sql",
    ),
    "utf8",
  );
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "payment_receipt_payee_fund_fk"/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS "payment_receipt_payee_fund_workspace_fk"/,
  );
  assert.match(migration, /payment_receipt_payee_fund_workspace_fk/);
  assert.match(
    migration,
    /FOREIGN KEY \("workspace_id", "payee_fund_id"\)/,
  );
  assert.match(
    migration,
    /REFERENCES "finance"\."petty_cash_fund"\("workspace_id", "id"\)/,
  );
  assert.match(migration, /ON DELETE RESTRICT/i);
  assert.match(migration, /NOT VALID/);
});

test("0097 is registered in the Drizzle migration journal", () => {
  const journal = readFileSync(
    resolve(process.cwd(), "migrations/meta/_journal.json"),
    "utf8",
  );
  assert.match(journal, /0097_payment_receipt_payee_fund_fk_restrict/);
  assert.match(journal, /0096_payment_receipt_payee_exactly_one/);
});
