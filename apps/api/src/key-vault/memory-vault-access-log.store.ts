import { randomUUID } from "node:crypto";
import type {
  VaultAccessLogEntry,
  VaultAccessLogInsert,
  VaultAccessLogStore,
} from "./vault-access-log.types.js";

const RING_MAX = 1000;

/** In-process ring for vault encrypt/decrypt access (Phase 2.2). */
export class MemoryVaultAccessLogStore implements VaultAccessLogStore {
  readonly persistence = "memory" as const;
  private readonly ring: VaultAccessLogEntry[] = [];

  async append(entry: VaultAccessLogInsert): Promise<VaultAccessLogEntry> {
    const row: VaultAccessLogEntry = {
      id: randomUUID(),
      secretRef: entry.secretRef,
      operation: entry.operation,
      actorType: entry.actorType ?? "system",
      actorId: entry.actorId ?? null,
      occurredAt: new Date(),
    };
    this.ring.push(row);
    if (this.ring.length > RING_MAX) {
      this.ring.splice(0, this.ring.length - RING_MAX);
    }
    return row;
  }

  async listRecent(limit = 50): Promise<VaultAccessLogEntry[]> {
    const n = Math.min(Math.max(limit, 1), 200);
    return [...this.ring].reverse().slice(0, n);
  }
}
