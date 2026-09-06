import assert from "node:assert/strict";
import test from "node:test";
import { redactForTest } from "../src/index.ts";

test("redact masks nested sensitive keys", () => {
  const out = redactForTest({
    user: "a",
    nested: { password: "x", ok: 1, card: { pan: "4111" } },
  }) as Record<string, unknown>;
  assert.equal(out.user, "a");
  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.password, "[redacted]");
  assert.equal(nested.ok, 1);
  assert.equal((nested.card as Record<string, unknown>).pan, "[redacted]");
});
