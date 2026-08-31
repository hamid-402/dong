import assert from "node:assert/strict";
import test from "node:test";

class TestIdempotency {
  private readonly entries = new Map<string, unknown>();
  private readonly pending = new Map<string, Promise<unknown>>();

  async run<T>(scope: string, actorId: string, key: string, work: () => Promise<T>): Promise<T> {
    const cacheKey = `${scope}:${actorId}:${key}`;
    if (this.entries.has(cacheKey)) {
      return this.entries.get(cacheKey) as T;
    }
    const inflight = this.pending.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
    const promise = work().then((value) => {
      this.entries.set(cacheKey, value);
      return value;
    }).finally(() => {
      this.pending.delete(cacheKey);
    });
    this.pending.set(cacheKey, promise);
    return promise as Promise<T>;
  }
}

test("idempotency returns same result for duplicate key", async () => {
  const svc = new TestIdempotency();
  let calls = 0;
  const first = await svc.run("expense.draft:ws1", "u1", "key-a", async () => {
    calls += 1;
    return { id: "e1" };
  });
  const second = await svc.run("expense.draft:ws1", "u1", "key-a", async () => {
    calls += 1;
    return { id: "e2" };
  });
  assert.equal(first.id, "e1");
  assert.equal(second.id, "e1");
  assert.equal(calls, 1);
});

test("concurrent idempotency calls share one execution", async () => {
  const svc = new TestIdempotency();
  let calls = 0;
  const work = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { id: "e-concurrent" };
  };
  const [a, b] = await Promise.all([
    svc.run("expense.draft:ws1", "u1", "key-b", work),
    svc.run("expense.draft:ws1", "u1", "key-b", work),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(calls, 1);
});
