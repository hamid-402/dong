import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema/index.js";
import type { TenantContext } from "./client.js";
import { tenantContextQuery } from "./client.js";

export type AppDatabase = NodePgDatabase<typeof schema>;

/**
 * Runs work inside a transaction after setting PostgreSQL session GUCs used by RLS.
 * Prefer this for every tenant-scoped query path.
 */
export async function withTenantContext<T>(
  db: AppDatabase,
  context: TenantContext,
  work: (tx: AppDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(tenantContextQuery(context));
    return work(tx);
  });
}

/** Clears tenant GUCs on the current transaction (local scope). */
export function clearTenantContextQuery() {
  return sql`
    select
      set_config('app.workspace_id', '', true),
      set_config('app.user_id', '', true)
  `;
}
