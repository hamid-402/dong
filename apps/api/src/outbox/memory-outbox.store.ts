import { randomUUID } from "node:crypto";
import type { OutboxWriteInput } from "@dang/contracts";
import {
  computeOutboxRetryUpdate,
  isOutboxDue,
} from "./outbox.retry.js";
import type { OutboxRecord, OutboxRelayStats, OutboxStore } from "./outbox.types.js";

export class MemoryOutboxStore implements OutboxStore {
  readonly persistence = "memory" as const;
  private readonly rows = new Map<string, OutboxRecord>();

  async insert(input: OutboxWriteInput): Promise<OutboxRecord> {
    const row: OutboxRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    this.rows.set(row.id, row);
    return row;
  }

  /** Test/debug peek — not part of OutboxStore. */
  get(id: string): OutboxRecord | undefined {
    return this.rows.get(id);
  }

  async listPending(limit = 50): Promise<OutboxRecord[]> {
    const now = Date.now();
    return [...this.rows.values()]
      .filter((r) => isOutboxDue(r, now))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async listPendingForRedrive(limit = 50): Promise<OutboxRecord[]> {
    return this.listPending(limit);
  }

  async markProcessed(id: string, _workspaceId?: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.processedAt = new Date().toISOString();
    row.nextAttemptAt = undefined;
  }

  async markFailed(id: string, _workspaceId: string, error: string): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    const update = computeOutboxRetryUpdate(row.attempts, error);
    row.attempts = update.attempts;
    row.lastError = update.lastError;
    row.nextAttemptAt = update.nextAttemptAt;
    row.deadLetteredAt = update.deadLetteredAt;
  }

  async getRelayStats(): Promise<OutboxRelayStats> {
    const pending = [...this.rows.values()].filter(
      (r) => !r.processedAt && !r.deadLetteredAt,
    );
    const now = Date.now();
    let oldestPendingAgeMs: number | null = null;
    for (const r of pending) {
      const age = now - Date.parse(r.createdAt);
      if (oldestPendingAgeMs == null || age > oldestPendingAgeMs) {
        oldestPendingAgeMs = age;
      }
    }
    return {
      pendingCount: pending.length,
      failedPendingCount: pending.filter(
        (r) => r.attempts > 0 || Boolean(r.lastError),
      ).length,
      oldestPendingAgeMs,
    };
  }
}
