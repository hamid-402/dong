import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_RPO_MS,
  evaluateTimedRestoreDrill,
  evaluateWalArchiveDepth,
} from "./wal-rpo-logic.mjs";

test("empty archive → unavailable, not proven", () => {
  const r = evaluateWalArchiveDepth([], { nowMs: 1_000_000 });
  assert.equal(r.available, false);
  assert.equal(r.proven, false);
  assert.equal(r.withinRpo, false);
});

test("newest WAL within RPO → proven", () => {
  const now = 10_000_000;
  const r = evaluateWalArchiveDepth(
    [
      { name: "0001", mtimeMs: now - 60_000 },
      { name: "0002", mtimeMs: now - 30_000 },
    ],
    { nowMs: now, rpoMs: DEFAULT_RPO_MS },
  );
  assert.equal(r.available, true);
  assert.equal(r.proven, true);
  assert.equal(r.fileCount, 2);
  assert.equal(r.newestAgeMs, 30_000);
});

test("stale WAL beyond RPO → not proven", () => {
  const now = 10_000_000;
  const r = evaluateWalArchiveDepth(
    [{ name: "old", mtimeMs: now - DEFAULT_RPO_MS - 1 }],
    { nowMs: now },
  );
  assert.equal(r.proven, false);
  assert.equal(r.withinRpo, false);
});

test("timed drill ok only when verify + RPO", () => {
  const archiveEval = evaluateWalArchiveDepth(
    [{ mtimeMs: 9_950_000 }],
    { nowMs: 10_000_000, rpoMs: 120_000 },
  );
  const ok = evaluateTimedRestoreDrill({
    archiveEval,
    restoreStartedMs: 10_000_000,
    restoreFinishedMs: 10_030_000,
    verifyOk: true,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.durationMs, 30_000);

  const bad = evaluateTimedRestoreDrill({
    archiveEval,
    restoreStartedMs: 10_000_000,
    restoreFinishedMs: 10_030_000,
    verifyOk: false,
  });
  assert.equal(bad.ok, false);
});
