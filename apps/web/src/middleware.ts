import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { API_SESSION_COOKIE } from "@dang/contracts/session-cookies";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite",
  "/ui-kit",
  "/payments/local",
];

const PROTECTED_PREFIXES = [
  "/hub",
  "/profile",
  "/workspaces",
  "/me",
  "/group",
  "/groups",
  "/orgs",
  "/onboarding",
  "/daily-ledger",
  "/proposals",
  "/w",
  "/account",
  "/spaces",
  "/whats-new",
  "/overview",
  "/admin",
];

/** Classic entries that map without a workspace slug (middleware can rewrite). */
const SLUGLESS_CLASSIC_REDIRECTS: Record<string, string> = {
  "/onboarding": "/spaces/new",
  "/profile": "/account",
};

/**
 * Exact segment boundary match — `/hub` matches `/hub` and `/hub/x`,
 * but not `/hub-fake` (unlike a raw `startsWith(prefix)` check).
 */
export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Session gate: only the HttpOnly API session cookie (`dang_session`) counts.
 * `dang_web_session` is a client UX hint and is not sufficient.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathMatchesPrefix(pathname, p))) {
    return NextResponse.next();
  }
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathMatchesPrefix(pathname, p));
  if (!needsAuth) return NextResponse.next();

  const apiSession = request.cookies.get(API_SESSION_COOKIE)?.value?.trim();
  if (!apiSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const normalized = pathname.replace(/\/$/, "") || "/";
  const sluglessDest = SLUGLESS_CLASSIC_REDIRECTS[normalized];
  if (sluglessDest) {
    const dest = request.nextUrl.clone();
    dest.pathname = sluglessDest;
    return NextResponse.redirect(dest);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/hub/:path*",
    "/profile",
    "/profile/:path*",
    "/workspaces/:path*",
    "/me",
    "/me/:path*",
    "/group",
    "/group/:path*",
    "/groups",
    "/groups/:path*",
    "/orgs",
    "/orgs/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/daily-ledger",
    "/daily-ledger/:path*",
    "/proposals",
    "/proposals/:path*",
    "/w",
    "/w/:path*",
    "/account",
    "/account/:path*",
    "/spaces",
    "/spaces/:path*",
    "/whats-new",
    "/whats-new/:path*",
    "/overview",
    "/overview/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
