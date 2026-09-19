import { randomUUID } from "node:crypto";
import type {
  VaultSecretInsert,
  VaultSecretRow,
  VaultStore,
} from "./key-vault.types.js";

export class MemoryVaultStore implements VaultStore {
  readonly persistence = "memory" as const;
  private readonly rows: VaultSecretRow[] = [];

  put(row: VaultSecretInsert): Promise<VaultSecretRow> {
    const existing = this.rows.find(
      (r) => r.name === row.name && r.version === row.version,
    );
    if (existing) {
      throw new Error("VAULT_SECRET_VERSION_EXISTS");
    }
    const created: VaultSecretRow = {
      id: randomUUID(),
      name: row.name,
      version: row.version,
      ciphertext: row.ciphertext,
      wrappedDek: row.wrappedDek,
      masterKeyVersion: row.masterKeyVersion,
      createdAt: new Date(),
    };
    this.rows.push(created);
    return Promise.resolve(created);
  }

  get(name: string, version?: number): Promise<VaultSecretRow | null> {
    const matches = this.rows.filter((r) => r.name === name);
    if (matches.length === 0) return Promise.resolve(null);
    if (version !== undefined) {
      return Promise.resolve(matches.find((r) => r.version === version) ?? null);
    }
    matches.sort((a, b) => b.version - a.version);
    return Promise.resolve(matches[0] ?? null);
  }

  listVersions(name: string): Promise<VaultSecretRow[]> {
    return Promise.resolve(
      this.rows
        .filter((r) => r.name === name)
        .sort((a, b) => b.version - a.version),
    );
  }

  listMeta(): Promise<
    Array<{
      name: string;
      latestVersion: number;
      masterKeyVersion: number;
      updatedAt: Date;
    }>
  > {
    const byName = new Map<string, VaultSecretRow>();
    for (const row of this.rows) {
      const cur = byName.get(row.name);
      if (!cur || row.version > cur.version) byName.set(row.name, row);
    }
    return Promise.resolve(
      [...byName.values()]
        .map((r) => ({
          name: r.name,
          latestVersion: r.version,
          masterKeyVersion: r.masterKeyVersion,
          updatedAt: r.createdAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  listAll(): Promise<VaultSecretRow[]> {
    return Promise.resolve([...this.rows]);
  }

  updateWrappedDek(
    name: string,
    version: number,
    wrappedDek: string,
    masterKeyVersion: number,
  ): Promise<VaultSecretRow | null> {
    const row = this.rows.find((r) => r.name === name && r.version === version);
    if (!row) return Promise.resolve(null);
    row.wrappedDek = wrappedDek;
    row.masterKeyVersion = masterKeyVersion;
    return Promise.resolve({ ...row });
  }

  countSecrets(): Promise<number> {
    const names = new Set(this.rows.map((r) => r.name));
    return Promise.resolve(names.size);
  }
}
