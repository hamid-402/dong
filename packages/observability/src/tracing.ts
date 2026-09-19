import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export type SpanAttributes = Record<string, string | number | boolean | undefined>;

type SpanFrame = {
  name: string;
  spanId: string;
  startMs: number;
  attributes: SpanAttributes;
};

type TraceContext = {
  requestId?: string;
  traceId: string;
  spans: SpanFrame[];
};

const traceStore = new AsyncLocalStorage<TraceContext>();

function hexId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** W3C trace-id (16 bytes) / span-id (8 bytes). */
export function newTraceId(): string {
  return hexId(16);
}

export function newSpanId(): string {
  return hexId(8);
}

export function getRequestId(): string | undefined {
  return traceStore.getStore()?.requestId;
}

export function getTraceId(): string | undefined {
  return traceStore.getStore()?.traceId;
}

export function getSpanId(): string | undefined {
  const frames = traceStore.getStore()?.spans;
  return frames && frames.length > 0 ? frames[frames.length - 1]?.spanId : undefined;
}

export type RequestLogContext = {
  requestId?: string;
  traceId?: string;
};

export function runWithRequestContext<T>(
  context: RequestLogContext,
  work: () => T,
): T {
  const parent = traceStore.getStore();
  const next: TraceContext = {
    requestId: context.requestId ?? parent?.requestId,
    traceId: context.traceId ?? parent?.traceId ?? newTraceId(),
    spans: parent?.spans ? [...parent.spans] : [],
  };
  return traceStore.run(next, work);
}

export type SpanResult<T> = {
  value: T;
  durationMs: number;
  traceId: string;
  spanId: string;
};

type SpanSink = (event: {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  durationMs: number;
  ok: boolean;
  attributes: SpanAttributes;
}) => void;

const sinks: SpanSink[] = [];

/** Register a span completion sink (tests / OTLP exporter). */
export function registerSpanSink(sink: SpanSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

/** Test helper — drop all sinks between cases. */
export function clearSpanSinksForTest(): void {
  sinks.length = 0;
}

function emitSpan(
  frame: SpanFrame,
  traceId: string,
  parentSpanId: string | undefined,
  ok: boolean,
  durationMs: number,
): void {
  const event = {
    name: frame.name,
    traceId,
    spanId: frame.spanId,
    parentSpanId,
    durationMs,
    ok,
    attributes: frame.attributes,
  };
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      /* never break business path */
    }
  }
  recordSpanSample(frame.name, durationMs, ok);
}

/**
 * Run work inside a named span. Creates ALS context if none exists.
 */
export async function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  work: () => Promise<T> | T,
): Promise<T> {
  const existing = traceStore.getStore();
  const run = async (ctx: TraceContext): Promise<T> => {
    const parentSpanId =
      ctx.spans.length > 0 ? ctx.spans[ctx.spans.length - 1]?.spanId : undefined;
    const frame: SpanFrame = {
      name,
      spanId: newSpanId(),
      startMs: Date.now(),
      attributes,
    };
    ctx.spans.push(frame);
    let ok = true;
    try {
      return await work();
    } catch (err) {
      ok = false;
      throw err;
    } finally {
      ctx.spans.pop();
      emitSpan(frame, ctx.traceId, parentSpanId, ok, Date.now() - frame.startMs);
    }
  };

  if (existing) {
    return run(existing);
  }
  const fresh: TraceContext = {
    requestId: undefined,
    traceId: newTraceId(),
    spans: [],
  };
  return traceStore.run(fresh, () => run(fresh));
}

/** Parse W3C `traceparent` (version-traceid-spanid-flags). */
export function parseTraceparent(
  header: string | undefined,
): { traceId: string; parentSpanId: string } | undefined {
  if (!header) return undefined;
  const parts = header.trim().split("-");
  if (parts.length < 4) return undefined;
  const traceId = parts[1];
  const parentSpanId = parts[2];
  if (!traceId || !parentSpanId) return undefined;
  if (!/^[0-9a-f]{32}$/i.test(traceId)) return undefined;
  if (!/^[0-9a-f]{16}$/i.test(parentSpanId)) return undefined;
  return { traceId: traceId.toLowerCase(), parentSpanId: parentSpanId.toLowerCase() };
}

export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

/* --- in-process golden-path samples (honest runtime; not a product UI) --- */

type SampleBucket = { count: number; sumMs: number; errors: number };

const samples = new Map<string, SampleBucket>();

function recordSpanSample(name: string, durationMs: number, ok: boolean): void {
  const cur = samples.get(name) ?? { count: 0, sumMs: 0, errors: 0 };
  cur.count += 1;
  cur.sumMs += durationMs;
  if (!ok) cur.errors += 1;
  samples.set(name, cur);
}

export type SpanSampleSnapshot = {
  name: string;
  count: number;
  avgMs: number;
  errors: number;
};

export function getSpanSamples(): SpanSampleSnapshot[] {
  return [...samples.entries()].map(([name, b]) => ({
    name,
    count: b.count,
    avgMs: b.count ? Math.round((b.sumMs / b.count) * 100) / 100 : 0,
    errors: b.errors,
  }));
}

export function resetSpanSamplesForTest(): void {
  samples.clear();
}

export type TracingMode = "off" | "local_spans" | "otlp";

export function resolveTracingMode(
  env: NodeJS.ProcessEnv = process.env,
): TracingMode {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return "otlp";
  if (env.DANG_TRACING === "0" || env.DANG_TRACING === "off") return "off";
  return "local_spans";
}
