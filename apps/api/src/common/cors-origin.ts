/**
 * CORS helpers — LAN private origins only for non-production local DX.
 */

export function isPrivateLanHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:") return false;
    const port = url.port || "80";
    if (port !== "3005") return false;
    const host = url.hostname;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    const m = /^172\.(\d{1,3})\./.exec(host);
    if (m) {
      const second = Number(m[1]);
      return second >= 16 && second <= 31;
    }
    return false;
  } catch {
    return false;
  }
}

export function allowCorsOrigin(input: {
  origin: string | undefined;
  webOrigin: string;
  extraOrigins: string[];
  nodeEnv: string;
}): boolean {
  const { origin, webOrigin, extraOrigins, nodeEnv } = input;
  if (!origin) return true;
  const allowed = new Set([
    webOrigin,
    "http://127.0.0.1:3005",
    "http://localhost:3005",
    ...extraOrigins,
  ]);
  if (allowed.has(origin)) return true;
  if (nodeEnv !== "production" && isPrivateLanHttpOrigin(origin)) return true;
  return false;
}
