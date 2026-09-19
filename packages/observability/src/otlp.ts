import {
  registerSpanSink,
  resolveTracingMode,
  type TracingMode,
} from "./tracing.js";

type SpanEvent = {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  durationMs: number;
  ok: boolean;
  attributes: Record<string, string | number | boolean | undefined>;
};

export type OtlpExporterOptions = {
  env?: NodeJS.ProcessEnv;
  /** Injected for unit tests (no network). */
  fetchImpl?: typeof fetch;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  /** Skip background timer; tests call flush/stop explicitly. */
  disableAutoFlush?: boolean;
};

export type OtlpExporterHandle = {
  mode: TracingMode;
  /** True when an OTLP sink is registered. */
  active: boolean;
  /** Flush queued spans (awaits in-flight POST). */
  flush: () => Promise<void>;
  /** Unregister sink, stop timer, flush remaining. */
  stop: () => Promise<void>;
};

/** Normalize collector base or full traces URL to OTLP/HTTP JSON traces path. */
export function resolveOtlpTracesUrl(endpoint: string): string {
  const base = endpoint.replace(/\/$/, "");
  return base.endsWith("/v1/traces") ? base : `${base}/v1/traces`;
}

function toOtlpSpan(span: SpanEvent, endMs: number) {
  const startMs = endMs - span.durationMs;
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: 1,
    startTimeUnixNano: String(BigInt(startMs) * 1_000_000n),
    endTimeUnixNano: String(BigInt(endMs) * 1_000_000n),
    attributes: Object.entries(span.attributes)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => ({
        key,
        value:
          typeof value === "number"
            ? { doubleValue: value }
            : typeof value === "boolean"
              ? { boolValue: value }
              : { stringValue: String(value) },
      })),
    status: { code: span.ok ? 1 : 2 },
  };
}

function buildBody(
  serviceName: string,
  spans: SpanEvent[],
  endMs: number,
): string {
  return JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "@dang/observability" },
            spans: spans.map((s) => toOtlpSpan(s, endMs)),
          },
        ],
      },
    ],
  });
}

/**
 * Optional OTLP/HTTP JSON exporter for completed spans (batched).
 * No-op when OTEL_EXPORTER_OTLP_ENDPOINT unset or mode is not otlp.
 */
function asExporterOptions(
  envOrOpts: NodeJS.ProcessEnv | OtlpExporterOptions | undefined,
): OtlpExporterOptions {
  if (!envOrOpts) return { env: process.env };
  const maybe = envOrOpts as OtlpExporterOptions;
  if (
    Object.prototype.hasOwnProperty.call(envOrOpts, "env") ||
    Object.prototype.hasOwnProperty.call(envOrOpts, "fetchImpl") ||
    Object.prototype.hasOwnProperty.call(envOrOpts, "maxBatchSize") ||
    Object.prototype.hasOwnProperty.call(envOrOpts, "flushIntervalMs") ||
    Object.prototype.hasOwnProperty.call(envOrOpts, "disableAutoFlush")
  ) {
    return maybe;
  }
  return { env: envOrOpts as NodeJS.ProcessEnv };
}

export function startOtlpSpanExporter(
  envOrOpts?: NodeJS.ProcessEnv | OtlpExporterOptions,
): OtlpExporterHandle {
  const opts = asExporterOptions(envOrOpts);
  const env = opts.env ?? process.env;
  const mode = resolveTracingMode(env);
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const noop: OtlpExporterHandle = {
    mode,
    active: false,
    flush: async () => undefined,
    stop: async () => undefined,
  };
  if (!endpoint || mode !== "otlp") {
    return noop;
  }

  const url = resolveOtlpTracesUrl(endpoint);
  const serviceName = env.OTEL_SERVICE_NAME?.trim() || "dang-api";
  const maxBatchSize = opts.maxBatchSize ?? 32;
  const flushIntervalMs = opts.flushIntervalMs ?? 1000;
  const doFetch = opts.fetchImpl ?? fetch;

  let queue: SpanEvent[] = [];
  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | undefined;

  const postBatch = async (batch: SpanEvent[]): Promise<void> => {
    if (batch.length === 0) return;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: buildBody(serviceName, batch, Date.now()),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "warn",
            service: "dang-otel",
            message: "OTLP export HTTP error",
            status: res.status,
            detail: (await res.text().catch(() => "")).slice(0, 200),
          }),
        );
      }
    } catch (err: unknown) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          service: "dang-otel",
          message: "OTLP export failed",
          detail: err instanceof Error ? err.message : "unknown",
        }),
      );
    }
  };

  const flush = async (): Promise<void> => {
    const batch = queue;
    queue = [];
    if (batch.length === 0) {
      await inFlight;
      return;
    }
    const next = inFlight.then(() => postBatch(batch));
    inFlight = next.catch(() => undefined);
    await next;
  };

  const scheduleFlush = (): void => {
    if (stopped) return;
    void flush();
  };

  const unsubscribe = registerSpanSink((span) => {
    if (stopped) return;
    queue.push(span);
    if (queue.length >= maxBatchSize) {
      scheduleFlush();
    }
  });

  if (!opts.disableAutoFlush) {
    timer = setInterval(scheduleFlush, flushIntervalMs);
    // Don't keep the process alive solely for the flush timer.
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      service: "dang-otel",
      message: "OTLP span exporter enabled",
      url,
      maxBatchSize,
      flushIntervalMs: opts.disableAutoFlush ? 0 : flushIntervalMs,
    }),
  );

  return {
    mode,
    active: true,
    flush,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      unsubscribe();
      await flush();
      await inFlight;
    },
  };
}
