export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function redact(fields: LogFields): LogFields {
  const next: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/password|secret|token|authorization|cookie/i.test(key)) {
      next[key] = "[redacted]";
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function createLogger(service: string) {
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    const payload = {
      ts: new Date().toISOString(),
      level,
      service,
      message,
      ...redact(fields),
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
