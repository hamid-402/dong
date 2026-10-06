import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";

/** Prefer IPv4 — Windows often resolves `localhost` to ::1 while API binds IPv4. */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://127.0.0.1:3006").replace(
  "://localhost",
  "://127.0.0.1",
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** Drop Domain= so session cookies bind to the web host (LAN IP or localhost). */
function sanitizeSetCookie(cookie: string): string {
  return cookie.replace(/;\s*Domain=[^;]*/gi, "");
}

async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<NextResponse> {
  const { path = [] } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const target = `${API_ORIGIN}/api/v1/${suffix}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  // Never forward browser Host — undici would target the wrong upstream on POST.
  headers.delete("host");
  headers.delete("connection");

  // SSE/long-poll must not use the short proxy timeout — AbortSignal.timeout(12s)
  // was closing notification streams and surfacing ERR_INCOMPLETE_CHUNKED_ENCODING.
  const wantsSse =
    path[path.length - 1] === "stream" ||
    (req.headers.get("accept") ?? "").includes("text/event-stream");
  // Exports / CSV / large downloads need a longer budget than ordinary JSON.
  const wantsLong =
    path.includes("exports") ||
    path.includes("download") ||
    path.some((seg) => seg === "export.csv" || seg.endsWith(".csv")) ||
    path.includes("import-csv") ||
    path.includes("data-export");
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
    // Short timeout for normal JSON; long for exports; SSE follows client abort only.
    signal: wantsSse
      ? req.signal
      : AbortSignal.timeout(wantsLong ? 120_000 : 12_000),
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const buf = Buffer.from(await req.arrayBuffer());
    init.body = buf;
    headers.set("content-length", String(buf.byteLength));
  }

  try {
    const upstream = await fetch(target, init);
    const out = new Headers();
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding") return;
      // Multiple Set-Cookie must be preserved; Headers#forEach may join — append each.
      if (lower === "set-cookie") return;
      out.set(key, value);
    });
    const getSetCookie = (
      upstream.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie?.();
    if (getSetCookie?.length) {
      for (const cookie of getSetCookie) out.append("set-cookie", sanitizeSetCookie(cookie));
    } else {
      const single = upstream.headers.get("set-cookie");
      if (single) out.append("set-cookie", sanitizeSetCookie(single));
    }

    if (wantsSse) {
      // Keep stream headers honest when something still hits the proxy.
      out.set("Cache-Control", "no-cache, no-transform");
      out.set("X-Accel-Buffering", "no");
      out.set("Content-Type", "text/event-stream; charset=utf-8");
      out.delete("content-length");
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "API proxy failed";
    const timedOut = /TimeoutError|aborted|AbortError|timed out/i.test(raw);
    const detail =
      timedOut
        ? `سرویس API روی پورت 3006 پاسخ نداد (timeout). ترمینال: pnpm dev:api`
        : /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(raw)
          ? `سرویس API روی پورت 3006 در دسترس نیست (${raw}). ترمینال: pnpm dev:api`
          : raw;
    return NextResponse.json(
      {
        type: "https://dang.local/problems/api-unreachable",
        title: timedOut ? "API timeout" : "API unreachable",
        status: 503,
        detail,
      },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
