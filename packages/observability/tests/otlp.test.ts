import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSpanSinksForTest,
  resolveOtlpTracesUrl,
  resolveTracingMode,
  runWithRequestContext,
  startOtlpSpanExporter,
  withSpan,
} from "../src/index.js";

test("resolveTracingMode: unset → local_spans; off; endpoint → otlp", () => {
  assert.equal(resolveTracingMode({}), "local_spans");
  assert.equal(resolveTracingMode({ DANG_TRACING: "off" }), "off");
  assert.equal(resolveTracingMode({ DANG_TRACING: "0" }), "off");
  assert.equal(
    resolveTracingMode({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" }),
    "otlp",
  );
  assert.equal(
    resolveTracingMode({ OTEL_EXPORTER_OTLP_ENDPOINT: "  " }),
    "local_spans",
  );
});

test("resolveOtlpTracesUrl appends /v1/traces once", () => {
  assert.equal(
    resolveOtlpTracesUrl("http://127.0.0.1:4318"),
    "http://127.0.0.1:4318/v1/traces",
  );
  assert.equal(
    resolveOtlpTracesUrl("http://127.0.0.1:4318/v1/traces"),
    "http://127.0.0.1:4318/v1/traces",
  );
  assert.equal(
    resolveOtlpTracesUrl("http://127.0.0.1:4318/"),
    "http://127.0.0.1:4318/v1/traces",
  );
});

test("startOtlpSpanExporter is no-op when endpoint unset", async () => {
  clearSpanSinksForTest();
  const handle = startOtlpSpanExporter({
    env: {},
    disableAutoFlush: true,
  });
  assert.equal(handle.mode, "local_spans");
  assert.equal(handle.active, false);
  await handle.stop();
});

test("startOtlpSpanExporter registers sink and batches on flush/stop", async () => {
  clearSpanSinksForTest();
  const posts: { url: string; body: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    posts.push({
      url: String(input),
      body: String(init?.body ?? ""),
    });
    return new Response("{}", { status: 200 });
  };

  const handle = startOtlpSpanExporter({
    env: {
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_SERVICE_NAME: "dang-test",
    },
    fetchImpl,
    disableAutoFlush: true,
    maxBatchSize: 10,
  });
  assert.equal(handle.mode, "otlp");
  assert.equal(handle.active, true);

  await runWithRequestContext({ requestId: "r1", traceId: "a".repeat(32) }, async () => {
    await withSpan("http.request", { requestId: "r1" }, async () => {
      await withSpan("expense.createDraft", { workspaceId: "w1" }, async () => "ok");
    });
  });

  assert.equal(posts.length, 0, "no network until flush");
  await handle.flush();
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.url, "http://127.0.0.1:4318/v1/traces");
  const payload = JSON.parse(posts[0]!.body) as {
    resourceSpans: Array<{
      resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
      scopeSpans: Array<{
        spans: Array<{ name: string; spanId: string; parentSpanId?: string }>;
      }>;
    }>;
  };
  const service = payload.resourceSpans[0]?.resource.attributes.find(
    (a) => a.key === "service.name",
  )?.value.stringValue;
  assert.equal(service, "dang-test");
  const spans = payload.resourceSpans[0]?.scopeSpans[0]?.spans ?? [];
  const spanNames = spans.map((s) => s.name);
  assert.ok(spanNames.includes("expense.createDraft"));
  assert.ok(spanNames.includes("http.request"));
  const child = spans.find((s) => s.name === "expense.createDraft") as
    | { parentSpanId?: string }
    | undefined;
  const parent = spans.find((s) => s.name === "http.request") as
    | { spanId: string }
    | undefined;
  assert.ok(child?.parentSpanId);
  assert.ok(parent?.spanId);
  assert.equal(child?.parentSpanId, parent?.spanId);

  await handle.stop();
  clearSpanSinksForTest();
});

test("startOtlpSpanExporter flushes remaining on stop without prior flush", async () => {
  clearSpanSinksForTest();
  let postCount = 0;
  const fetchImpl: typeof fetch = async () => {
    postCount += 1;
    return new Response("{}", { status: 200 });
  };
  const handle = startOtlpSpanExporter({
    env: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" },
    fetchImpl,
    disableAutoFlush: true,
  });
  await withSpan("health.ready", {}, async () => true);
  assert.equal(postCount, 0);
  await handle.stop();
  assert.equal(postCount, 1);
  clearSpanSinksForTest();
});

test("startOtlpSpanExporter flushes when maxBatchSize reached", async () => {
  clearSpanSinksForTest();
  let postCount = 0;
  const fetchImpl: typeof fetch = async () => {
    postCount += 1;
    return new Response("{}", { status: 200 });
  };
  const handle = startOtlpSpanExporter({
    env: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" },
    fetchImpl,
    disableAutoFlush: true,
    maxBatchSize: 2,
  });
  await withSpan("a", {}, async () => {
    await withSpan("b", {}, async () => "ok");
  });
  // child then parent → 2 spans → auto flush at maxBatchSize
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(postCount >= 1);
  await handle.stop();
  clearSpanSinksForTest();
});
