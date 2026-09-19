import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const here = __dirname;

test("JobsModule does not statically import Retention (TDZ guard)", () => {
  const src = readFileSync(join(here, "jobs.module.ts"), "utf8");
  assert.equal(
    /from\s+["'][^"']*retention[^"']*["']/.test(src),
    false,
    "jobs.module.ts must not import retention — use ModuleRef at runtime",
  );
});

test("AttachmentsModule does not import JobsModule (TDZ guard)", () => {
  const src = readFileSync(
    join(here, "../attachments/attachments.module.ts"),
    "utf8",
  );
  assert.equal(
    /from\s+["'][^"']*jobs\/jobs\.module[^"']*["']/.test(src),
    false,
    "attachments.module.ts must not import jobs.module — Jobs is @Global",
  );
  assert.equal(
    /imports:\s*\[[^\]]*JobsModule/.test(src),
    false,
    "attachments.module.ts imports array must not list JobsModule",
  );
});

test("ExpensesModule does not import BillingModule (TDZ guard)", () => {
  const src = readFileSync(join(here, "../expenses/expenses.module.ts"), "utf8");
  assert.equal(
    /from\s+["'][^"']*billing\/billing\.module[^"']*["']/.test(src),
    false,
    "expenses.module must not import billing.module — Billing is @Global",
  );
  assert.equal(
    /imports:\s*\[[^\]]*BillingModule/.test(src),
    false,
    "expenses.module imports array must not list BillingModule",
  );
});

test("ExpensesModule and RetentionModule do not import AttachmentsModule (TDZ guard)", () => {
  const expenses = readFileSync(join(here, "../expenses/expenses.module.ts"), "utf8");
  const retention = readFileSync(
    join(here, "../retention/retention.module.ts"),
    "utf8",
  );
  assert.equal(
    /from\s+["'][^"']*attachments\/attachments\.module[^"']*["']/.test(expenses),
    false,
    "expenses.module must not import attachments.module — Attachments is @Global",
  );
  assert.equal(
    /from\s+["'][^"']*attachments\/attachments\.module[^"']*["']/.test(retention),
    false,
    "retention.module must not import attachments.module — Attachments is @Global",
  );
});
