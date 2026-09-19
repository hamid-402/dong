import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

test("migration 0081 workspace_webhook has RLS + grants", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    join(here, "../../../../packages/db/migrations/0081_workspace_webhooks.sql"),
    "utf8",
  );
  assert.match(sql, /ops\.workspace_webhook/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON ops\.workspace_webhook/);
  assert.match(sql, /idempotency_key/);
});
