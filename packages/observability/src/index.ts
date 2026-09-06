import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

type RequestLogContext = {
  requestId?: string;
};

const requestContext = new AsyncLocalStorage<RequestLogContext>();

export function runWithRequestContext<T>(
  context: RequestLogContext,
  work: () => T,
): T {
  return requestContext.run(context, work);
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

const SENSITIVE_KEY =
  /password|secret|token|authorization|cookie|amountMinor.*card|pan|cvv/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[max-depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function redactFields(fields: LogFields): LogFields {
  const next: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    next[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(value);
  }
  return next;
}

export function createLogger(service: string) {
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const requestId = getRequestId();
    const payload = {
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...(requestId ? { requestId } : {}),
      ...redactFields(fields),
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  };

  return {
    debug: (message: string, fields?: LogFields) => write("debug", message, fields),
    info: (message: string, fields?: LogFields) => write("info", message, fields),
    warn: (message: string, fields?: LogFields) => write("warn", message, fields),
    error: (message: string, fields?: LogFields) => write("error", message, fields),
  };
}

/** Exported for unit tests. */
export { redact as redactForTest };
