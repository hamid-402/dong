import Redis from "ioredis";
import {
  DANG_JOB_DLQ_KEY,
  DANG_JOB_QUEUE_KEY,
  DANG_WORKER_HEARTBEAT_KEY,
  type DeadLetterJob,
  type QueuedWorkerJob,
} from "@dang/contracts";
import { isRedisConfigured, loadAppEnv } from "@dang/config";

let shared: Redis | null = null;
let lastFailAt = 0;

function createRedis(url: string): Redis {
  return new Redis(url, {
    // Required for BLPOP / blocking commands
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 2000,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 8) return null;
      return Math.min(times * 200, 2000);
    },
  });
}

export async function getRedisClient(): Promise<Redis | null> {
  const env = loadAppEnv();
  if (!isRedisConfigured(env) || !env.redisUrl) return null;
  if (Date.now() - lastFailAt < 3000) return null;
  if (shared && shared.status === "ready") return shared;

  try {
    const client = createRedis(env.redisUrl);
    client.on("error", () => {
      /* offline */
    });
    await client.connect();
    shared = client;
    return client;
  } catch {
    lastFailAt = Date.now();
    try {
      shared?.disconnect();
    } catch {
      /* ignore */
    }
    shared = null;
    return null;
  }
}

export async function enqueueWorkerJob(job: QueuedWorkerJob): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;
  try {
    await client.rpush(DANG_JOB_QUEUE_KEY, JSON.stringify(job));
    return true;
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return false;
  }
}

export async function isWorkerHeartbeatAlive(): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;
  try {
    const value = await client.get(DANG_WORKER_HEARTBEAT_KEY);
    return Boolean(value);
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return false;
  }
}

export async function touchWorkerHeartbeat(ttlSeconds = 45): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.set(DANG_WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", ttlSeconds);
  } catch {
    lastFailAt = Date.now();
    shared = null;
  }
}

export async function blpopWorkerJob(
  timeoutSeconds = 5,
): Promise<QueuedWorkerJob | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    const result = await client.blpop(DANG_JOB_QUEUE_KEY, timeoutSeconds);
    if (!result?.[1]) return null;
    return JSON.parse(result[1]) as QueuedWorkerJob;
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return null;
  }
}

function parseDeadLetter(raw: string): DeadLetterJob | null {
  try {
    const parsed = JSON.parse(raw) as DeadLetterJob;
    if (!parsed?.job || typeof parsed.error !== "string" || typeof parsed.attempts !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Length of dead-letter list (null when Redis unavailable). */
export async function getDlqLength(): Promise<number | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    return await client.llen(DANG_JOB_DLQ_KEY);
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return null;
  }
}

/** Peek newest DLQ items (LRANGE from the right end) without removing. */
export async function listDlqItems(limit = 50): Promise<DeadLetterJob[] | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    const capped = Math.max(1, Math.min(limit, 100));
    const len = await client.llen(DANG_JOB_DLQ_KEY);
    if (len === 0) return [];
    const start = Math.max(0, len - capped);
    const raw = await client.lrange(DANG_JOB_DLQ_KEY, start, -1);
    return raw
      .map(parseDeadLetter)
      .filter((x): x is DeadLetterJob => x !== null)
      .reverse();
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return null;
  }
}

/**
 * Replay one dead-letter job: remove from DLQ, LPUSH back to main queue.
 * When `workspaceId` is set, only replay an entry whose job.workspaceId matches
 * (or is missing — legacy / opaque payloads visible to owner/admin callers).
 * Returns the entry, or null if empty / no match / Redis down.
 */
export async function replayDlqJob(
  workspaceId?: string,
): Promise<DeadLetterJob | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    if (!workspaceId) {
      const raw = await client.rpop(DANG_JOB_DLQ_KEY);
      if (!raw) return null;
      const entry = parseDeadLetter(raw);
      if (!entry) {
        // Malformed — do not re-queue; leave dropped (already popped).
        return null;
      }
      await client.lpush(DANG_JOB_QUEUE_KEY, JSON.stringify(entry.job));
      return entry;
    }

    const rawItems = await client.lrange(DANG_JOB_DLQ_KEY, 0, -1);
    // RPOP order: scan from the right (tail).
    for (let i = rawItems.length - 1; i >= 0; i -= 1) {
      const raw = rawItems[i];
      if (!raw) continue;
      const entry = parseDeadLetter(raw);
      if (!entry || !dlqEntryMatchesWorkspace(entry, workspaceId)) continue;
      const removed = await client.lrem(DANG_JOB_DLQ_KEY, 1, raw);
      if (removed === 0) continue;
      await client.lpush(DANG_JOB_QUEUE_KEY, JSON.stringify(entry.job));
      return entry;
    }
    return null;
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return null;
  }
}

/** True when job.workspaceId matches, or payload has no workspaceId (legacy). */
export function dlqEntryMatchesWorkspace(
  entry: DeadLetterJob,
  workspaceId: string,
): boolean {
  const jobWs = entry.job?.workspaceId;
  if (jobWs == null || jobWs === "") return true;
  return jobWs === workspaceId;
}

/** Mirror of worker push — useful for tests / ops tooling. */
export async function pushDeadLetter(entry: DeadLetterJob): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;
  try {
    await client.rpush(DANG_JOB_DLQ_KEY, JSON.stringify(entry));
    return true;
  } catch {
    lastFailAt = Date.now();
    shared = null;
    return false;
  }
}
