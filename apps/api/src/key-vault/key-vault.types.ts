import type { AppDatabase } from "@dang/db";

export type VaultSecretRow = {
  id: string;
  name: string;
  version: number;
  ciphertext: string;
  wrappedDek: string;
  masterKeyVersion: number;
  createdAt: Date;
};

export type VaultSecretInsert = {
  name: string;
  version: number;
  ciphertext: string;
  wrappedDek: string;
  masterKeyVersion: number;
};

export type VaultStore = {
  readonly persistence: "memory" | "postgres";
  readonly db?: AppDatabase;
  put(row: VaultSecretInsert): Promise<VaultSecretRow>;
  get(name: string, version?: number): Promise<VaultSecretRow | null>;
  listVersions(name: string): Promise<VaultSecretRow[]>;
  listMeta(): Promise<
    Array<{
      name: string;
      latestVersion: number;
      masterKeyVersion: number;
      updatedAt: Date;
    }>
  >;
  listAll(): Promise<VaultSecretRow[]>;
  updateWrappedDek(
    name: string,
    version: number,
    wrappedDek: string,
    masterKeyVersion: number,
  ): Promise<VaultSecretRow | null>;
  countSecrets(): Promise<number>;
};

export const KEY_VAULT_STORE = Symbol("KEY_VAULT_STORE");
