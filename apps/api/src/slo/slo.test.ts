import assert from "node:assert/strict";
import { test } from "node:test";
import { computePlatformSlo, SLO_THRESHOLDS } from "./slo.compute.js";

test("fixture: healthy counters → no breach", () => {
  const res = computePlatformSlo(
    {
      outbox: { pendingCount: 0, failedPendingCount: 0, oldestPendingAgeMs: null },
      jobsDlq: { length: 0 },
      security: { totalInWindow: 100, highOrCriticalInWindow: 0 },
    },
    { generatedAt: "2026-09-13T00:00:00.000Z" },
  );
  assert.equal(res.provider, "in_app_v1");
  assert.equal(res.breached, false);
  assert.equal(res.windows.length, 3);
  for (const win of res.windows) {
    assert.equal(win.breached, false);
    for (const s of win.signals) {
      assert.equal(s.available, true);
      assert.equal(s.breached, false);
      assert.ok(s.burnRate !== null && s.burnRate < 1);
    }
  }
});

test("fixture: outbox lag past RPO → breached on 5m", () => {
  const res = computePlatformSlo({
    outbox: {
      pendingCount: 3,
      failedPendingCount: 0,
      oldestPendingAgeMs: SLO_THRESHOLDS.outboxMaxPendingAgeMs + 1,
    },
    jobsDlq: { length: 0 },
    security: { totalInWindow: 20, highOrCriticalInWindow: 0 },
  });
  const five = res.windows.find((w) => w.id === "5m");
  assert.ok(five);
  const outbox = five.signals.find((s) => s.id === "outbox_relay");
  assert.ok(outbox?.available);
  assert.equal(outbox?.breached, true);
  assert.equal(five.breached, true);
  assert.equal(res.breached, true);
});

test("fixture: failed relay burns budget", () => {
  const res = computePlatformSlo({
    outbox: { pendingCount: 1, failedPendingCount: 1, oldestPendingAgeMs: 1000 },
    jobsDlq: { length: 0 },
    security: { totalInWindow: 20, highOrCriticalInWindow: 0 },
  });
  const outbox = res.windows[0]?.signals.find((s) => s.id === "outbox_relay");
  assert.equal(outbox?.breached, true);
});

test("fixture: DLQ length > 0 breaches", () => {
  const res = computePlatformSlo({
    outbox: { pendingCount: 0, failedPendingCount: 0, oldestPendingAgeMs: null },
    jobsDlq: { length: 2 },
    security: { totalInWindow: 20, highOrCriticalInWindow: 0 },
  });
  const dlq = res.windows[0]?.signals.find((s) => s.id === "jobs_dlq");
  assert.equal(dlq?.available, true);
  assert.equal(dlq?.breached, true);
});

test("fixture: missing sources stay unavailable (honest empty)", () => {
  const res = computePlatformSlo({
    outbox: null,
    jobsDlq: null,
    security: { totalInWindow: 2, highOrCriticalInWindow: 2 },
  });
  assert.equal(res.breached, false);
  const five = res.windows[0];
  assert.ok(five);
  assert.equal(five.signals.find((s) => s.id === "outbox_relay")?.available, false);
  assert.equal(five.signals.find((s) => s.id === "jobs_dlq")?.available, false);
  const sec = five.signals.find((s) => s.id === "security_error_rate");
  assert.equal(sec?.available, false);
  assert.equal(sec?.unavailableReason, "insufficient_sample");
  assert.equal(sec?.burnRate, null);
  assert.equal(sec?.breached, false);
});

test("fixture: high security error rate breaches when sample enough", () => {
  const res = computePlatformSlo({
    outbox: { pendingCount: 0, failedPendingCount: 0, oldestPendingAgeMs: null },
    jobsDlq: { length: 0 },
    security: { totalInWindow: 100, highOrCriticalInWindow: 5 },
  });
  const sec = res.windows.find((w) => w.id === "5m")?.signals.find(
    (s) => s.id === "security_error_rate",
  );
  assert.equal(sec?.available, true);
  assert.ok((sec?.burnRate ?? 0) >= 1);
  assert.equal(sec?.breached, true);
});
