import type { AppDatabase } from "@dang/db";
import type { OutboxRelayStats, OutboxWriteInput } from "@dang/contracts";

export type OutboxRecord = OutboxWriteInput & {
  id: string;
  createdAt: string;
  processedAt?: string;
  attempts: number;
  lastError?: string;
  /** When set, redrive skips until this instant (exponential backoff). */
  nextAttemptAt?: string;
  /** When set, row is dead-lettered — no further automatic retries. */
  deadLetteredAt?: string;
};

export type { OutboxRelayStats };

export type OutboxStore = {
  readonly persistence: "memory" | "postgres";
  readonly db?: AppDatabase;
  insert(
    input: OutboxWriteInput,
    options?: { tx?: AppDatabase },
  ): Promise<OutboxRecord>;
  listPending(limit?: number): Promise<OutboxRecord[]>;
  /**
   * Cross-tenant pending rows for platform redrive (SECURITY DEFINER on Postgres).
   * Memory store falls back to listPending.
   */
  listPendingForRedrive?(limit?: number): Promise<OutboxRecord[]>;
  markProcessed(id: string, workspaceId: string): Promise<void>;
  markFailed(id: string, workspaceId: string, error: string): Promise<void>;
  /** Platform SLO aggregate (null when unreadable under RLS / missing fn). */
  getRelayStats?(): Promise<OutboxRelayStats | null>;
};

export const OUTBOX_STORE = Symbol("OUTBOX_STORE");
