import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type TenantContext = {
  workspaceId?: string;
  userId?: string;
};

type SharedEntry = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  pool: Pool;
  refs: number;
  close: () => Promise<void>;
};

const sharedDatabases = new Map<string, SharedEntry>();

function poolIsEnded(pool: Pool): boolean {
  return Boolean((pool as Pool & { ended?: boolean }).ended);
}

/**
 * One Pool/drizzle instance per connection string so Nest stores share connections.
 * `close()` is ref-counted — health pings must not tear down the app pool.
 */
export function getSharedDatabase(connectionString: string) {
  const existing = sharedDatabases.get(connectionString);
  if (existing && !poolIsEnded(existing.pool)) {
    existing.refs += 1;
    return existing;
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });

  const entry: SharedEntry = {
    db,
    pool,
    refs: 1,
    async close() {
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs > 0) return;
      if (sharedDatabases.get(connectionString) === entry) {
        sharedDatabases.delete(connectionString);
      }
      if (!poolIsEnded(pool)) {
        await pool.end();
      }
    },
  };
  sharedDatabases.set(connectionString, entry);
  return entry;
}

export type SharedDatabase = ReturnType<typeof getSharedDatabase>;

/** Cached alias — all `fromConnectionString` factories share pools via this. */
export function createDatabase(connectionString: string): SharedDatabase {
  return getSharedDatabase(connectionString);
}

export function tenantContextQuery(context: TenantContext) {
  return sql`
    select
      set_config('app.workspace_id', ${context.workspaceId ?? ""}, true),
      set_config('app.user_id', ${context.userId ?? ""}, true)
  `;
}
