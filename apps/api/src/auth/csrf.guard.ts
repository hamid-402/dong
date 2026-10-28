import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { CSRF_COOKIE, CSRF_HEADER, verifyLocalPspIntentSignature } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { createLogger } from "@dang/observability";
import { allowCorsOrigin } from "../common/cors-origin.js";
import { PAYMENT_STORE, type PaymentStore } from "../payments/payment.store.js";
import { SESSION_COOKIE } from "./account.types.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const logger = createLogger("dang-api-csrf");

/**
 * Auth entrypoints that establish or recover a session.
 * A stale HttpOnly `dang_session` without a matching readable CSRF cookie
 * must not block login/register (common after partial cookie clear / HMR).
 *
 * Dev bootstrap is not listed. With no session cookie this guard already
 * allows the post. With a session cookie the double-submit token is required
 * so a header cannot rotate that cookie without the readable CSRF cookie.
 */
const CSRF_EXEMPT_PATH_SUFFIXES = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/mfa/verify",
  "/auth/logout",
] as const;

const LOCAL_PSP_VERIFY_PATH =
  /\/payments\/local\/intents\/([^/]+)\/verify\/?$/i;

type FastifyRequestLike = {
  method: string;
  url?: string;
  routerPath?: string;
  raw?: { url?: string };
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: { sig?: string };
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

function extraCorsOrigins(): string[] {
  return (process.env.WEB_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function originFromReferer(referer: string | undefined): string | undefined {
  const raw = referer?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/**
 * Double-submit CSRF for cookie-authenticated mutations.
 * Skips safe methods, requests without a session cookie, and auth entrypoints
 * (auth entrypoints still require an allowed Origin/Referer when present).
 * LocalPSP verify is exempt only when the intent HMAC is valid.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Optional() private readonly moduleRef?: ModuleRef) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequestLike>();
    const method = (request.method ?? "GET").toUpperCase();
    if (SAFE_METHODS.has(method)) return true;

    const path = requestPath(request);

    if (LOCAL_PSP_VERIFY_PATH.test(path)) {
      if (await this.localPspVerifyHmacValid(path, request)) {
        return true;
      }
      // Invalid/missing HMAC → fall through to normal CSRF enforcement.
    } else if (isCsrfExemptPath(path)) {
      this.assertExemptPathOriginAllowed(request, path);
      return true;
    }

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

  private assertExemptPathOriginAllowed(
    request: FastifyRequestLike,
    path: string,
  ): void {
    const originHeader = headerValue(request.headers, "origin")?.trim();
    const refererHeader = headerValue(request.headers, "referer")?.trim();
    if (!originHeader && !refererHeader) {
      logger.warn("csrf.exempt_auth_missing_origin_referer", { path });
      return;
    }

    const candidate = originHeader || originFromReferer(refererHeader);
    if (!candidate) {
      logger.warn("csrf.exempt_auth_unparseable_referer", { path });
      return;
    }

    const env = loadAppEnv();
    const allowed = allowCorsOrigin({
      origin: candidate,
      webOrigin: env.webOrigin,
      extraOrigins: extraCorsOrigins(),
      nodeEnv: env.nodeEnv,
    });
    if (!allowed) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/csrf-origin",
        title: "Origin not allowed",
        status: 403,
        detail: "درخواست از دامنهٔ غیرمجاز رد شد.",
      });
    }
  }

  private async localPspVerifyHmacValid(
    path: string,
    request: FastifyRequestLike,
  ): Promise<boolean> {
    const match = LOCAL_PSP_VERIFY_PATH.exec(path);
    const intentId = match?.[1]?.trim() ?? "";
    const sig = request.body?.sig?.trim() ?? "";
    if (!intentId || !sig || !this.moduleRef) return false;

    let store: PaymentStore | undefined;
    try {
      store = this.moduleRef.get<PaymentStore>(PAYMENT_STORE, { strict: false });
    } catch {
      return false;
    }
    if (!store) return false;

    const pending = await store.findPendingLocalPsp(intentId);
    if (!pending) return false;

    return verifyLocalPspIntentSignature({
      secret: loadAppEnv().sessionSecret,
      intentId: pending.intentId,
      workspaceId: pending.workspaceId,
      amountMinor: pending.amountMinor,
      expiresAt: pending.expiresAt,
      signature: sig,
    });
  }
}
