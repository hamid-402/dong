import type { Redis } from "ioredis";
import { ConflictException, Injectable } from "@nestjs/common";
import { isRedisConfigured, loadAppEnv } from "@dang/config";
import { getRedisClient } from "../jobs/redis-queue.js";

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

/**
 * Idempotency cache.
 * - No Redis: in-process Map + shared Promise for concurrent duplicates.
 * - Redis: SET NX pending lock; concurrent in-flight across instances → 409
 *   (documented API behavior for multi-instance deployments).
 */
@Injectable()
export class IdempotencyService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;
  private readonly pendingTtlSec = 30;

  async run<T>(
    scope: string,
    actorId: string,
    key: string | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    const normalized = key?.trim();
    if (!normalized) {
      return work();
    }

    const cacheKey = `${scope}:${actorId}:${normalized}`;
    const env = loadAppEnv();
    if (isRedisConfigured(env)) {
      const redis = await getRedisClient();
      if (redis) {
        return this.runRedis(redis, cacheKey, work);
      }
    }
    return this.runMemory(cacheKey, work);
  }

  private async runMemory<T>(cacheKey: string, work: () => Promise<T>): Promise<T> {
    this.prune();

    const existing = this.entries.get(cacheKey);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.value as T;
    }

    const inflight = this.pending.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }

    const promise = work()
      .then((value) => {
        this.entries.set(cacheKey, {
          value,
          expiresAt: Date.now() + this.ttlMs,
        });
        return value;
      })
      .finally(() => {
        this.pending.delete(cacheKey);
      });

    this.pending.set(cacheKey, promise);
    return promise;
  }

  private async runRedis<T>(
    redis: Redis,
    cacheKey: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const redisKey = `idem:${cacheKey}`;
    const cached = await redis.get(redisKey);
    if (cached && cached !== "PENDING") {
      return JSON.parse(cached) as T;
    }
    if (cached === "PENDING") {
      throw new ConflictException({
        type: "https://dang.local/problems/idempotency-in-flight",
        title: "Duplicate request in flight",
        status: 409,
        detail: "Retry shortly; the same idempotency key is being processed",
      });
    }

    const locked = await redis.set(redisKey, "PENDING", "EX", this.pendingTtlSec, "NX");
    if (!locked) {
      throw new ConflictException({
        type: "https://dang.local/problems/idempotency-in-flight",
        title: "Duplicate request in flight",
        status: 409,
        detail: "Retry shortly; the same idempotency key is being processed",
      });
    }

    try {
      const value = await work();
      await redis.set(redisKey, JSON.stringify(value), "EX", Math.floor(this.ttlMs / 1000));
      return value;
    } catch (err) {
      await redis.del(redisKey);
      throw err;
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
