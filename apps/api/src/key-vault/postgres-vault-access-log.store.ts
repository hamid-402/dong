import {
  createDatabase,
  desc,
  vaultAccessLog as vaultAccessLogTable,
  type AppDatabase,
} from "@dang/db";
import type {
  VaultAccessLogEntry,
  VaultAccessLogInsert,
  VaultAccessLogStore,
  VaultAccessOperation,
  VaultAccessActorType,
} from "./vault-access-log.types.js";

function toEntry(row: typeof vaultAccessLogTable.$inferSelect): VaultAccessLogEntry {
  return {
    id: row.id,
    secretRef: row.secretRef,
    operation: row.operation as VaultAccessOperation,
    actorType: row.actorType as VaultAccessActorType,
    actorId: row.actorId ?? null,
    occurredAt: row.occurredAt,
  };
}

export class PostgresVaultAccessLogStore implements VaultAccessLogStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresVaultAccessLogStore {
    const { db } = createDatabase(url);
    return new PostgresVaultAccessLogStore(db);
  }

  async append(entry: VaultAccessLogInsert): Promise<VaultAccessLogEntry> {
    const [row] = await this.db
      .insert(vaultAccessLogTable)
      .values({
        secretRef: entry.secretRef,
        operation: entry.operation,
        actorType: entry.actorType ?? "system",
        actorId: entry.actorId ?? null,
      })
      .returning();
    if (!row) throw new Error("VAULT_ACCESS_LOG_INSERT_FAILED");
    return toEntry(row);
  }

  async listRecent(limit = 50): Promise<VaultAccessLogEntry[]> {
    const n = Math.min(Math.max(limit, 1), 200);
    const rows = await this.db
      .select()
      .from(vaultAccessLogTable)
      .orderBy(desc(vaultAccessLogTable.occurredAt))
      .limit(n);
    return rows.map(toEntry);
  }
}
