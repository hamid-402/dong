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
};

/** Single session-cookie issuance path for password, OIDC, and MFA. */
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
  reply.setCookie(SESSION_COOKIE, raw, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}
