import {
  and,
  createDatabase,
  desc,
  eq,
  vaultSecret,
  type AppDatabase,
} from "@dang/db";
import type {
  VaultSecretInsert,
  VaultSecretRow,
  VaultStore,
} from "./key-vault.types.js";

function mapRow(row: typeof vaultSecret.$inferSelect): VaultSecretRow {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    ciphertext: row.ciphertext,
    wrappedDek: row.wrappedDek,
    masterKeyVersion: row.masterKeyVersion,
    createdAt: row.createdAt,
  };
}

export class PostgresVaultStore implements VaultStore {
  readonly persistence = "postgres" as const;

  constructor(readonly db: AppDatabase) {}

  static fromConnectionString(url: string): PostgresVaultStore {
    const { db } = createDatabase(url);
    return new PostgresVaultStore(db);
  }

  async put(row: VaultSecretInsert): Promise<VaultSecretRow> {
    const [inserted] = await this.db
      .insert(vaultSecret)
      .values({
        name: row.name,
        version: row.version,
        ciphertext: row.ciphertext,
        wrappedDek: row.wrappedDek,
        masterKeyVersion: row.masterKeyVersion,
      })
      .returning();
    if (!inserted) throw new Error("VAULT_INSERT_FAILED");
    return mapRow(inserted);
  }

  async get(name: string, version?: number): Promise<VaultSecretRow | null> {
    if (version !== undefined) {
      const rows = await this.db
        .select()
        .from(vaultSecret)
        .where(and(eq(vaultSecret.name, name), eq(vaultSecret.version, version)))
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    }
    const rows = await this.db
      .select()
      .from(vaultSecret)
      .where(eq(vaultSecret.name, name))
      .orderBy(desc(vaultSecret.version))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async listVersions(name: string): Promise<VaultSecretRow[]> {
    const rows = await this.db
      .select()
      .from(vaultSecret)
      .where(eq(vaultSecret.name, name))
      .orderBy(desc(vaultSecret.version));
    return rows.map(mapRow);
  }

  async listMeta(): Promise<
    Array<{
      name: string;
      latestVersion: number;
      masterKeyVersion: number;
      updatedAt: Date;
    }>
  > {
    const rows = await this.db
      .select()
      .from(vaultSecret)
      .orderBy(desc(vaultSecret.version));
    const byName = new Map<
      string,
      { name: string; latestVersion: number; masterKeyVersion: number; updatedAt: Date }
    >();
    for (const row of rows) {
      if (byName.has(row.name)) continue;
      byName.set(row.name, {
        name: row.name,
        latestVersion: row.version,
        masterKeyVersion: row.masterKeyVersion,
        updatedAt: row.createdAt,
      });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async listAll(): Promise<VaultSecretRow[]> {
    const rows = await this.db.select().from(vaultSecret);
    return rows.map(mapRow);
  }

  async updateWrappedDek(
    name: string,
    version: number,
    wrappedDek: string,
    masterKeyVersion: number,
  ): Promise<VaultSecretRow | null> {
    const updated = await this.db
      .update(vaultSecret)
      .set({ wrappedDek, masterKeyVersion })
      .where(and(eq(vaultSecret.name, name), eq(vaultSecret.version, version)))
      .returning();
    return updated[0] ? mapRow(updated[0]) : null;
  }

  async countSecrets(): Promise<number> {
    const rows = await this.db
      .select({ name: vaultSecret.name })
      .from(vaultSecret)
      .groupBy(vaultSecret.name);
    return rows.length;
  }
}
