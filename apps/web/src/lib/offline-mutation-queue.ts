/**
 * Client mutation queue for offline / API-unreachable (R10-19).
 * Conflict policy: server-wins — on 4xx (except 408/429) drop local entry;
 * keep and retry on network/503; idempotencyKey preserved for safe replay.
 * Storage: localStorage (same pattern as offline drafts) — not IndexedDB/CRDT.
 */

export type OfflineMutation = {
  id: string;
  createdAt: string;
  method: "POST";
  path: string;
  body: string;
  idempotencyKey?: string;
  label: string;
  /** Successful flush attempts are not counted; increments on retryable failure. */
  attemptCount?: number;
  lastAttemptAt?: string;
};

export type OfflineStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

const STORAGE_KEY = "dang.offline.mutations.v1";
/** Soft cap — oldest dropped when exceeded (server-wins; no CRDT merge). */
export const OFFLINE_QUEUE_MAX = 50;

export function readOfflineMutations(storage: OfflineStorage): OfflineMutation[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMutation);
  } catch {
    return [];
  }
}

export function writeOfflineMutations(
  storage: OfflineStorage,
  items: readonly OfflineMutation[],
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueOfflineMutation(
  storage: OfflineStorage,
  input: Omit<OfflineMutation, "id" | "createdAt"> & { id?: string },
): OfflineMutation {
  const item: OfflineMutation = {
    id: input.id ?? cryptoRandomId(),
    createdAt: new Date().toISOString(),
    method: input.method,
    path: input.path,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    label: input.label,
    attemptCount: 0,
  };
  let next = readOfflineMutations(storage);
  // Dedupe by idempotencyKey — keep newest payload for same key.
  if (item.idempotencyKey?.trim()) {
    const key = item.idempotencyKey.trim();
    next = next.filter((m) => m.idempotencyKey?.trim() !== key);
  }
  next = [...next, item];
  if (next.length > OFFLINE_QUEUE_MAX) {
    next = next.slice(next.length - OFFLINE_QUEUE_MAX);
  }
  writeOfflineMutations(storage, next);
  return item;
}

export function removeOfflineMutation(storage: OfflineStorage, id: string): void {
  writeOfflineMutations(
    storage,
    readOfflineMutations(storage).filter((m) => m.id !== id),
  );
}

export type FlushFetch = (
  path: string,
  init: { method: string; body: string },
  idempotencyKey?: string,
) => Promise<unknown>;

export type FlushResult = {
  sent: string[];
  dropped: string[];
  deferred: string[];
};

/** Replay queue FIFO. Network/503 → stop (keep rest). 4xx → drop that entry. */
export async function flushOfflineMutations(
  storage: OfflineStorage,
  fetchFn: FlushFetch,
  isRetryable: (error: unknown) => boolean,
): Promise<FlushResult> {
  const result: FlushResult = { sent: [], dropped: [], deferred: [] };
  const queue = readOfflineMutations(storage);
  const remaining: OfflineMutation[] = [];

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i]!;
    try {
      await fetchFn(item.path, { method: item.method, body: item.body }, item.idempotencyKey);
      result.sent.push(item.id);
    } catch (error: unknown) {
      if (isRetryable(error)) {
        const now = new Date().toISOString();
        const bumped: OfflineMutation = {
          ...item,
          attemptCount: (item.attemptCount ?? 0) + 1,
          lastAttemptAt: now,
        };
        remaining.push(bumped, ...queue.slice(i + 1));
        result.deferred.push(item.id, ...queue.slice(i + 1).map((m) => m.id));
        break;
      }
      result.dropped.push(item.id);
    }
  }

  writeOfflineMutations(storage, remaining);
  return result;
}

export function isRetryableOfflineError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error).status === "number"
  ) {
    const status = (error as { status: number }).status;
    return status === 0 || status === 408 || status === 429 || status === 503;
  }
  if (error instanceof Error) {
    return /Failed to fetch|NetworkError|ECONNREFUSED|API unreachable|503/i.test(
      error.message,
    );
  }
  return false;
}

function isMutation(value: unknown): value is OfflineMutation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.path === "string" &&
    typeof v.body === "string" &&
    v.method === "POST" &&
    typeof v.label === "string"
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `off-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class OfflineQueuedError extends Error {
  readonly queueId: string;
  constructor(queueId: string, label: string) {
    super(`«${label}» در صف آفلاین ذخیره شد؛ با بازگشت شبکه ارسال می‌شود`);
    this.name = "OfflineQueuedError";
    this.queueId = queueId;
  }
}
