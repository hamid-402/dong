/**
 * A field Lighthouse run has to hit a public host.
 * Loopback and private LAN addresses are lab runs and must not be reported as field.
 */

export function fieldUrlProblem(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "missing url";
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return "not a url";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "not http(s)";
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return "loopback is a lab run, not a field run";
  }
  if (isPrivateOrLoopbackV4(host)) return "private address is not a field run";
  return null;
}

function isPrivateOrLoopbackV4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

const isDirectRun = process.argv[1]?.endsWith("field-url.mjs");
if (isDirectRun) {
  const problem = fieldUrlProblem(process.argv[2] ?? process.env.TARGET_URL ?? "");
  if (problem) {
    console.error(`field-url: FAIL ${problem}`);
    process.exit(1);
  }
  console.log("field-url: OK");
}
