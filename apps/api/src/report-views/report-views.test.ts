import assert from "node:assert/strict";
import test from "node:test";
import { MemoryReportViewsStore } from "./memory-report-views.store.js";

test("G07 report views CRUD in memory store", async () => {
  const store = new MemoryReportViewsStore();
  const userId = "11111111-1111-4111-8111-111111111111";
  assert.equal((await store.list(userId)).length, 0);
  const created = await store.create(userId, {
    name: "گروه‌ها",
    kind: "group",
    months: 6,
    sortKey: "spend",
  });
  assert.equal(created.kind, "group");
  const listed = await store.list(userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, created.id);
  assert.equal(await store.delete(userId, created.id), true);
  assert.equal(await store.delete(userId, created.id), false);
  assert.equal((await store.list(userId)).length, 0);
});
