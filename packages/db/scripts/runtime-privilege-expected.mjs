/**
 * Expected dang_runtime table privileges (code-aligned).
 * Append-only / insert-log tables intentionally omit UPDATE.
 * Does not read .env. Optional live check: DATABASE_URL in process env, port 5432 only.
 *
 * Run live: node packages/db/scripts/runtime-privilege-expected.mjs
 */
import pg from "pg";

/** @typedef {{ select: boolean, insert: boolean, update: boolean, delete: boolean }} Priv */

/** @type {Record<string, Priv>} */
export const EXPECTED_RUNTIME_TABLE_PRIVS = {
  // personal lifestyle (0102) — column UPDATE still reports as table UPDATE=true
  "personal.money_intent": { select: true, insert: true, update: false, delete: false }, // table UPDATE false; column UPDATE granted
  "personal.allocation_plan": { select: true, insert: true, update: false, delete: false }, // table UPDATE false; column UPDATE granted
  "personal.paycheck": { select: true, insert: true, update: false, delete: false },

  // append-only / insert-log — missing UPDATE is OK (SIU heuristic was wrong)
  "audit.event": { select: true, insert: true, update: false, delete: false },
  "ops.vault_access_log": { select: true, insert: true, update: false, delete: false },
  "ops.security_event": { select: true, insert: true, update: false, delete: false },
  "analytics.etl_run": { select: true, insert: true, update: false, delete: false },
  "ops.workspace_webhook_delivery": {
    select: true,
    insert: true,
    update: false,
    delete: false,
  },
  "saas.subscription_payment_map": {
    select: true,
    insert: true,
    update: false,
    delete: false,
  },
};

export const EXPECTED_SCHEMA_USAGE = {
  personal: true,
  // catalog = 0103; drizzle never for runtime
  catalog: false,
  drizzle: false,
};

function assertPort5432(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const port = parsed.port || "5432";
  if (port === "5437") {
    throw new Error("refusing DATABASE_URL on port 5437");
  }
  if (port !== "5432") {
    throw new Error(`refusing DATABASE_URL on port ${port}; only 5432 allowed`);
  }
}

async function liveAudit(databaseUrl) {
  assertPort5432(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const who = await client.query(
      "select current_user::text as u, inet_server_port() as p",
    );
    const role = who.rows[0]?.u ?? "?";
    const port = who.rows[0]?.p;
    if (port === 5437) throw new Error("refusing live DB on port 5437");
    if (port !== 5432) throw new Error(`refusing live DB on port ${port}`);
    console.log(`who=${role} server_port=${port}`);

    const failures = [];

    for (const [schema, want] of Object.entries(EXPECTED_SCHEMA_USAGE)) {
      const q = await client.query(
        `select has_schema_privilege(current_user, $1, 'USAGE') as u`,
        [schema],
      );
      const got = Boolean(q.rows[0]?.u);
      if (got !== want) {
        failures.push(`schema ${schema} USAGE got=${got} expected=${want}`);
      }
    }

    for (const [fqn, want] of Object.entries(EXPECTED_RUNTIME_TABLE_PRIVS)) {
      const q = await client.query(
        `
        select
          has_table_privilege(current_user, $1, 'SELECT') as s,
          has_table_privilege(current_user, $1, 'INSERT') as i,
          has_table_privilege(current_user, $1, 'UPDATE') as u,
          has_table_privilege(current_user, $1, 'DELETE') as d
        `,
        [fqn],
      );
      const row = q.rows[0];
      if (!row) {
        failures.push(`${fqn} privilege probe empty`);
        continue;
      }
      const got = {
        select: Boolean(row.s),
        insert: Boolean(row.i),
        update: Boolean(row.u),
        delete: Boolean(row.d),
      };
      for (const k of /** @type {(keyof Priv)[]} */ ([
        "select",
        "insert",
        "update",
        "delete",
      ])) {
        if (got[k] !== want[k]) {
          failures.push(
            `${fqn} ${k.toUpperCase()} got=${got[k]} expected=${want[k]}`,
          );
        }
      }
    }

    if (failures.length) {
      console.log("FAIL count=" + failures.length);
      for (const f of failures) console.log("FAIL " + f);
      process.exitCode = 1;
      return;
    }
    console.log("OK privilege matrix matches expected");
  } finally {
    await client.end();
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("runtime-privilege-expected.mjs") ||
    process.argv[1].includes("runtime-privilege-expected"));

if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("SKIP live audit — DATABASE_URL unset (no .env load)");
    process.exit(0);
  }
  liveAudit(url).catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(2);
  });
}
