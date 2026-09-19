export type VaultAccessOperation = "encrypt" | "decrypt";

export type VaultAccessActorType = "user" | "worker" | "system";

export type VaultAccessLogEntry = {
  id: string;
  secretRef: string;
  operation: VaultAccessOperation;
  actorType: VaultAccessActorType;
  actorId: string | null;
  occurredAt: Date;
};

export type VaultAccessLogInsert = {
  secretRef: string;
  operation: VaultAccessOperation;
  actorType?: VaultAccessActorType;
  actorId?: string | null;
};

export type VaultAccessLogStore = {
  readonly persistence: "memory" | "postgres";
  append(entry: VaultAccessLogInsert): Promise<VaultAccessLogEntry>;
  listRecent(limit?: number): Promise<VaultAccessLogEntry[]>;
};

export const VAULT_ACCESS_LOG_STORE = Symbol("VAULT_ACCESS_LOG_STORE");
