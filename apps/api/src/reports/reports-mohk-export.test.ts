import assert from "node:assert/strict";
import test from "node:test";
import { MemoryReportsStore } from "./reports.store.js";

test("mohk_csv export uses DocDate and Debit columns", async () => {
  const store = new MemoryReportsStore();
  store.expenseReader = async () => [
    {
      id: "e1",
      title: "Supplies",
      occurredOn: "2026-09-07",
      total: { amountMinor: "100000" },
      visibility: "company",
      status: "posted",
    },
  ];
  const summary = await store.createExport("w1", "u1", {
    from: "2026-09-01",
    to: "2026-09-30",
    format: "mohk_csv",
    idempotencyKey: "exp-mohk-1",
  });
  assert.equal(summary.format, "mohk_csv");
  assert.ok(summary.csvBody?.includes("DocDate"));
  assert.ok(summary.csvBody?.includes("2026-09-07"));
  assert.ok(summary.csvBody?.includes("10000"));
});
