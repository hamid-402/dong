import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite",
  "/ui-kit",
];

const PROTECTED_PREFIXES = ["/hub", "/profile", "/workspaces", "/me", "/groups", "/orgs"];

/**
 * Additive session gate:
 * - Prefer real API session cookie (`dang_session`) when same-origin proxy is used
 * - Keep `dang_web_session` for existing password/OIDC client flows (not removed)
 * - Dev identity still works after client marks web session
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const apiSession = request.cookies.get("dang_session")?.value?.trim();
  const webSession = request.cookies.get("dang_web_session")?.value?.trim();
  const hasSession = Boolean(apiSession) || webSession === "1" || Boolean(webSession);

  if (hasSession) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/hub/:path*",
    "/profile",
    "/profile/:path*",
    "/workspaces/:path*",
    "/me",
    "/me/:path*",
    "/groups",
    "/groups/:path*",
    "/orgs",
    "/orgs/:path*",
  ],
};
