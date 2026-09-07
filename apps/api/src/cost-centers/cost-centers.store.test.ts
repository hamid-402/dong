import assert from "node:assert/strict";
import test from "node:test";
import { MemoryCostCenterStore } from "./memory-cost-center.store.js";

test("cost center codes are unique per workspace", async () => {
  const store = new MemoryCostCenterStore();
  const created = await store.create("ws-a", "owner", {
    name: "پروژه شمال",
    code: "NORTH",
  });
  assert.equal(created.active, true);
  assert.equal((await store.list("ws-a", "owner")).length, 1);
  assert.equal((await store.list("ws-b", "owner")).length, 0);

  await assert.rejects(
    () =>
      store.create("ws-a", "owner", {
        name: "تکراری",
        code: "NORTH",
      }),
    (error: unknown) =>
      error instanceof Error && error.message === "COST_CENTER_CODE_EXISTS",
  );

  await store.create("ws-b", "owner", {
    name: "همان کد در فضای دیگر",
    code: "NORTH",
  });
});
