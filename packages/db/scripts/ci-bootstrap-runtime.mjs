/**
 * Apply runtime role + grants for CI / local RLS tests.
 * Usage: DATABASE_URL=postgresql://dang:dang@localhost:5432/dang_test node scripts/ci-bootstrap-runtime.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "ci-bootstrap-runtime.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(sql);
  const role = await client.query(
    `select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'dang_runtime'`,
  );
  const row = role.rows[0];
  if (!row) throw new Error("dang_runtime role missing after bootstrap");
  if (row.rolsuper || row.rolbypassrls) {
    throw new Error("dang_runtime must not be superuser or BYPASSRLS");
  }
  console.log("ci-bootstrap-runtime: ok", row);
} finally {
  await client.end();
}
