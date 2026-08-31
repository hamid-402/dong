import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type TenantContext = {
  workspaceId?: string;
  userId?: string;
};

export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async close() {
      await pool.end();
    },
  };
}

export function tenantContextQuery(context: TenantContext) {
  return sql`
    select
      set_config('app.workspace_id', ${context.workspaceId ?? ""}, true),
      set_config('app.user_id', ${context.userId ?? ""}, true)
  `;
}
