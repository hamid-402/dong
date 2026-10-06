import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPool } from "./directory-metrics.js";

describe("directory-metrics mapPool", () => {
  it("preserves order with bounded concurrency", async () => {
    const active = { n: 0, max: 0 };
    const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active.n += 1;
      active.max = Math.max(active.max, active.n);
      await new Promise((r) => setTimeout(r, 5));
      active.n -= 1;
      return n * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50, 60]);
    assert.ok(active.max <= 2);
  });
});
