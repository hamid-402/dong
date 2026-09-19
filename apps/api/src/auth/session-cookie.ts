import { CSRF_COOKIE, REAUTH_COOKIE } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AccountStore,
} from "./account.types.js";
import { hashToken, newOpaqueToken } from "./password.js";

export type CookieReply = {
  setCookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => void;
  clearCookie?: (name: string, options?: Record<string, unknown>) => void;
};

function cookieBase(env: ReturnType<typeof loadAppEnv>) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: env.nodeEnv === "production",
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
    secure: env.nodeEnv === "production",
  };
  reply.clearCookie?.(SESSION_COOKIE, { ...base, httpOnly: true });
  reply.clearCookie?.(CSRF_COOKIE, { ...base, httpOnly: false });
  reply.clearCookie?.(REAUTH_COOKIE, { ...base, httpOnly: true });
}
