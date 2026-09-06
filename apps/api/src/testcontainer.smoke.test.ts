import assert from "node:assert/strict";
import test from "node:test";
import { startTestDb } from "./test/setup/testcontainer.js";

test("testcontainer/DATABASE_URL bootstrap is available or skipped", async (t) => {
  const handle = await startTestDb();
  if (!handle) {
    t.skip("Docker/Testcontainers unavailable and DATABASE_URL unset");
    return;
  }
  t.after(async () => {
    await handle.stop();
  });
  assert.ok(handle.connectionUri.includes("postgres"));
});
