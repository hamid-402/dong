import { Injectable } from "@nestjs/common";

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

@Injectable()
export class IdempotencyService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;

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

    this.prune();
    const cacheKey = `${scope}:${actorId}:${normalized}`;

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

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
