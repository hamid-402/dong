import assert from "node:assert/strict";
import test from "node:test";
import {
  getTraceId,
  resetSpanSamplesForTest,
  resolveTracingMode,
  runWithRequestContext,
  withSpan,
  getSpanSamples,
  parseTraceparent,
  formatTraceparent,
} from "../src/index.js";

test("withSpan nests and records samples", async () => {
  resetSpanSamplesForTest();
  await runWithRequestContext({ requestId: "r1", traceId: "a".repeat(32) }, async () => {
    await withSpan("http.request", { route: "/x" }, async () => {
      assert.equal(getTraceId(), "a".repeat(32));
      await withSpan("expense.post", { workspaceId: "w" }, async () => "ok");
    });
  });
  const samples = getSpanSamples();
  assert.ok(samples.some((s) => s.name === "expense.post" && s.count >= 1));
  assert.ok(samples.some((s) => s.name === "http.request" && s.count >= 1));
});

test("parseTraceparent accepts W3C header", () => {
  const tid = "b".repeat(32);
  const sid = "c".repeat(16);
  const parsed = parseTraceparent(formatTraceparent(tid, sid));
  assert.deepEqual(parsed, { traceId: tid, parentSpanId: sid });
});

test("resolveTracingMode respects OTEL endpoint", () => {
  assert.equal(resolveTracingMode({}), "local_spans");
  assert.equal(resolveTracingMode({ DANG_TRACING: "off" }), "off");
  assert.equal(
    resolveTracingMode({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" }),
    "otlp",
  );
});

test("registerSpanSink receives nested span events", async () => {
  const { registerSpanSink, clearSpanSinksForTest } = await import("../src/index.js");
  clearSpanSinksForTest();
  const seen: string[] = [];
  const unsub = registerSpanSink((e) => {
    seen.push(e.name);
  });
  await runWithRequestContext({ requestId: "r2", traceId: "d".repeat(32) }, async () => {
    await withSpan("http.request", {}, async () => {
      await withSpan("health.ready", {}, async () => "ok");
    });
  });
  unsub();
  assert.deepEqual(seen, ["health.ready", "http.request"]);
  clearSpanSinksForTest();
});
