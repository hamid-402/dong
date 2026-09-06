import assert from "node:assert/strict";
import test from "node:test";
import { MemoryWorkspaceRangeLockStore } from "./workspace-range-lock.store.js";

test("range lock rejects overlapping active ranges", async () => {
  const store = new MemoryWorkspaceRangeLockStore();
  await store.create("w1", "u1", {
    from: "2026-09-01",
    to: "2026-09-10",
    idempotencyKey: "a",
  });
  await assert.rejects(
    () =>
      store.create("w1", "u1", {
        from: "2026-09-05",
        to: "2026-09-15",
        idempotencyKey: "b",
      }),
    /RANGE_OVERLAP/,
  );
});

test("range lock unlock clears active flag", async () => {
  const store = new MemoryWorkspaceRangeLockStore();
  const lock = await store.create("w1", "u1", {
    from: "2026-09-01",
    to: "2026-09-30",
    idempotencyKey: "month",
  });
  const unlocked = await store.unlock("w1", lock.id, "u1");
  assert.equal(unlocked.active, false);
  const active = await store.list("w1", "u1", { activeOnly: true });
  assert.equal(active.length, 0);
});
