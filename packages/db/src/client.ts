import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type TenantContext = {
  workspaceId?: string;
  userId?: string;
};

const sharedDatabases = new Map<
  string,
  {
    db: ReturnType<typeof drizzle<typeof schema>>;
    pool: Pool;
    close: () => Promise<void>;
  }
>();

/**
 * One Pool/drizzle instance per connection string so Nest stores share connections.
 */
export function getSharedDatabase(connectionString: string) {
  const existing = sharedDatabases.get(connectionString);
  if (existing) return existing;

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });

  const entry = {
    db,
    pool,
    async close() {
      sharedDatabases.delete(connectionString);
      await pool.end();
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
