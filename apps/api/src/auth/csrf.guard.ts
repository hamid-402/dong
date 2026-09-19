import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { CSRF_COOKIE, CSRF_HEADER } from "@dang/contracts";
import { SESSION_COOKIE } from "./account.types.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Auth entrypoints that establish or recover a session.
 * A stale HttpOnly `dang_session` without a matching readable CSRF cookie
 * must not block login/register (common after partial cookie clear / HMR).
 */
const CSRF_EXEMPT_PATH_SUFFIXES = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/mfa/verify",
  "/auth/dev/bootstrap-session",
  "/auth/logout",
] as const;

type FastifyRequestLike = {
  method: string;
  url?: string;
  routerPath?: string;
  raw?: { url?: string };
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string | undefined,
): string | undefined {
  if (!name) return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function requestPath(request: FastifyRequestLike): string {
  const raw = request.routerPath ?? request.url ?? request.raw?.url ?? "";
  return raw.split("?")[0] ?? "";
}

function isCsrfExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATH_SUFFIXES.some(
    (suffix) => path === suffix || path.endsWith(suffix),
  );
}

/**
 * Double-submit CSRF for cookie-authenticated mutations.
 * Skips safe methods, requests without a session cookie, and auth entrypoints.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequestLike>();
    const method = (request.method ?? "GET").toUpperCase();
    if (SAFE_METHODS.has(method)) return true;
    if (isCsrfExemptPath(requestPath(request))) return true;

    const session = request.cookies?.[SESSION_COOKIE]?.trim();
    if (!session) return true;

    const cookieToken = request.cookies?.[CSRF_COOKIE]?.trim() ?? "";
    const headerToken = headerValue(request.headers, CSRF_HEADER)?.trim() ?? "";
    if (!cookieToken || !headerToken || !timingSafeEqual(cookieToken, headerToken)) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/csrf-failed",
        title: "CSRF validation failed",
        status: 403,
        detail: "درخواست بدون توکن CSRF معتبر رد شد.",
      });
    }
    return true;
  }
}
