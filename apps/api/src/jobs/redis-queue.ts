import Redis from "ioredis";
import {
  DANG_JOB_QUEUE_KEY,
  DANG_WORKER_HEARTBEAT_KEY,
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
