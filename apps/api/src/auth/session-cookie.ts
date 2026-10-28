import { CSRF_COOKIE, REAUTH_COOKIE } from "@dang/contracts";
import { loadAppEnv, resolveCookieSecure } from "@dang/config";
import { createLogger } from "@dang/observability";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AccountStore,
} from "./account.types.js";
import { hashToken, newOpaqueToken } from "./password.js";

const logger = createLogger("dang-api-session-cookie");
let warnedProductionCookieSecureOverride = false;

export type CookieReply = {
  setCookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => void;
  clearCookie?: (name: string, options?: Record<string, unknown>) => void;
};

/** Resolve Secure for session cookies; warn when production forces Secure on. */
export function sessionCookieSecure(
  env: ReturnType<typeof loadAppEnv> = loadAppEnv(),
  cookieSecureRaw: string | undefined = process.env.COOKIE_SECURE,
): boolean {
  const { secure, forcedInProduction } = resolveCookieSecure(
    env.nodeEnv,
    cookieSecureRaw,
  );
  if (forcedInProduction && !warnedProductionCookieSecureOverride) {
    warnedProductionCookieSecureOverride = true;
    logger.warn(
      "COOKIE_SECURE=0/false ignored in production; Secure cookie remains forced on",
    );
  }
  return secure;
}

function cookieBase(env: ReturnType<typeof loadAppEnv>) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: sessionCookieSecure(env),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** Single session-cookie issuance path for password, OIDC, MFA, and dev bootstrap. */
export async function issueSessionCookie(
  accounts: AccountStore,
  userId: string,
  reply: CookieReply,
  meta?: { ip?: string; userAgent?: string },
): Promise<void> {
  const env = loadAppEnv();
  const raw = newOpaqueToken();
  await accounts.createSession({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
  const base = cookieBase(env);
  reply.setCookie(SESSION_COOKIE, raw, {
    ...base,
    httpOnly: true,
  });
  reply.setCookie(CSRF_COOKIE, newOpaqueToken(), {
    ...base,
    httpOnly: false,
  });
}

export function clearSessionCookies(reply: CookieReply): void {
  const env = loadAppEnv();
  const base = {
    path: "/",
    sameSite: "lax" as const,
    secure: sessionCookieSecure(env),
  };
  reply.clearCookie?.(SESSION_COOKIE, { ...base, httpOnly: true });
  reply.clearCookie?.(CSRF_COOKIE, { ...base, httpOnly: false });
  reply.clearCookie?.(REAUTH_COOKIE, { ...base, httpOnly: true });
}
