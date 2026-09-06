import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";

/** Prefer IPv4 — Windows often resolves `localhost` to ::1 while API binds IPv4. */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://127.0.0.1:3006").replace(
  "://localhost",
  "://127.0.0.1",
);

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

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
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
      for (const cookie of getSetCookie) out.append("set-cookie", cookie);
    } else {
      const single = upstream.headers.get("set-cookie");
      if (single) out.append("set-cookie", single);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  } catch (error: unknown) {
    const detail =
      error instanceof Error && /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(error.message)
        ? "سرویس API روی پورت 3006 در دسترس نیست. در ترمینال جدا: pnpm dev:api"
        : error instanceof Error
          ? error.message
          : "API proxy failed";
    return NextResponse.json(
      {
        type: "https://dang.local/problems/api-unreachable",
        title: "API unreachable",
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
