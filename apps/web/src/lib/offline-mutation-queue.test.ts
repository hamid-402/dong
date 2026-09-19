import { describe, expect, it } from "vitest";
import {
  enqueueOfflineMutation,
  flushOfflineMutations,
  isRetryableOfflineError,
  readOfflineMutations,
} from "./offline-mutation-queue";

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("offline mutation queue (R10-19)", () => {
  it("enqueue + flush success clears queue", async () => {
    const storage = memStorage();
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/workspaces/w/expenses",
      body: "{}",
      label: "پیش‌نویس خرج",
      idempotencyKey: "k1",
    });
    expect(readOfflineMutations(storage)).toHaveLength(1);
    const result = await flushOfflineMutations(
      storage,
      async () => ({ ok: true }),
      isRetryableOfflineError,
    );
    expect(result.sent).toHaveLength(1);
    expect(readOfflineMutations(storage)).toHaveLength(0);
  });

  it("flush stops and keeps rest on retryable error", async () => {
    const storage = memStorage();
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/a",
      body: "1",
      label: "a",
    });
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/b",
      body: "2",
      label: "b",
    });
    let n = 0;
    const result = await flushOfflineMutations(
      storage,
      async () => {
        n += 1;
        if (n === 1) {
          const err = new Error("fail") as Error & { status: number };
          err.status = 503;
          throw err;
        }
        return {};
      },
      isRetryableOfflineError,
    );
    expect(result.deferred).toHaveLength(2);
    expect(readOfflineMutations(storage)).toHaveLength(2);
  });

  it("non-retryable 400 drops entry and continues", async () => {
    const storage = memStorage();
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/bad",
      body: "{}",
      label: "bad",
    });
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/ok",
      body: "{}",
      label: "ok",
    });
    const result = await flushOfflineMutations(
      storage,
      async (path) => {
        if (path === "/bad") {
          const err = new Error("validation") as Error & { status: number };
          err.status = 400;
          throw err;
        }
        return {};
      },
      isRetryableOfflineError,
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.sent).toHaveLength(1);
    expect(readOfflineMutations(storage)).toHaveLength(0);
  });

  it("enqueue dedupes by idempotencyKey and bumps attemptCount on defer", async () => {
    const storage = memStorage();
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/a",
      body: '{"v":1}',
      label: "a",
      idempotencyKey: "same-key",
    });
    enqueueOfflineMutation(storage, {
      method: "POST",
      path: "/a",
      body: '{"v":2}',
      label: "a2",
      idempotencyKey: "same-key",
    });
    expect(readOfflineMutations(storage)).toHaveLength(1);
    expect(readOfflineMutations(storage)[0]?.body).toBe('{"v":2}');

    await flushOfflineMutations(
      storage,
      async () => {
        const err = new Error("down") as Error & { status: number };
        err.status = 503;
        throw err;
      },
      isRetryableOfflineError,
    );
    const deferred = readOfflineMutations(storage)[0];
    expect(deferred?.attemptCount).toBe(1);
    expect(deferred?.lastAttemptAt).toBeTruthy();
  });
});
