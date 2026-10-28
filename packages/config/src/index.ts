import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type EnvBag = Record<string, string | undefined>;

/**
 * Loads the first existing .env among common monorepo locations.
 * Does not override variables already present in the environment.
 */
export function loadEnvFile(
  candidates: string[] = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(process.cwd(), "../../.env"),
  ],
  target: EnvBag = process.env,
): boolean {
  let loaded = false;
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (target[key] === undefined) {
        target[key] = value;
      }
    }
    loaded = true;
  }
  return loaded;
}

export type AppEnv = {
  nodeEnv: "development" | "test" | "production";
  webOrigin: string;
  apiPort: number;
  apiBaseUrl: string;
  databaseUrl?: string;
  redisUrl?: string;
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  /** When true (default in development), accept trusted local actor headers. */
  allowDevAuth: boolean;
  /**
   * Hard MFA enrollment gate for finance/sensitive actions.
   * Default: on in production; off in development/test unless REQUIRE_MFA=1
   * (local DevAuth DX). Capabilities.mfa mirrors this — never claim MFA on while off.
   */
  requireMfa: boolean;
  /**
   * Group create / group expense and settlement writes require a verified email.
   * Default: on in production; off in development/test unless REQUIRE_EMAIL_VERIFICATION=1.
   * Still skipped while allowDevAuth is on, so local DevAuth sessions keep working.
   */
  requireEmailVerification: boolean;
  /** Session cookie secret (dev default is insecure; set SESSION_SECRET in prod). */
  sessionSecret: string;
  /** Local directory for attachment binary blobs (optional). */
  attachmentBlobDir?: string;
  /** SMTP URL e.g. smtp://user:pass@host:587 — enables real email delivery. */
  smtpUrl?: string;
  smtpFrom?: string;
  /** PSP merchant id (Zarinpal). Live only with ZARINPAL_ENABLED=1. */
  zarinpalMerchantId?: string;
  /** Override Zarinpal browser return endpoint (defaults from API_BASE_URL). */
  zarinpalCallbackUrl?: string;
  /**
   * Session/CSRF/reauth cookie Secure flag (COOKIE_SECURE).
   * Production always forces true even if COOKIE_SECURE=0.
   */
  cookieSecure: boolean;
};

function requireString(name: string, fallback?: string): string {
  const value = fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readEnv(): EnvBag {
  const processLike = globalThis as typeof globalThis & {
    process?: { env?: EnvBag };
  };
  return processLike.process?.env ?? {};
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * Env-driven Secure cookie flag (COOKIE_SECURE).
 * Unset → true only in production. Explicit true enables Secure outside production.
 * Explicit false is honored outside production; in production Secure stays forced
 * on and `forcedInProduction` is set so callers can warn.
 */
export function resolveCookieSecure(
  nodeEnv: AppEnv["nodeEnv"],
  cookieSecureRaw: string | undefined = readEnv().COOKIE_SECURE,
): { secure: boolean; forcedInProduction: boolean } {
  const productionDefault = nodeEnv === "production";
  if (cookieSecureRaw === undefined || cookieSecureRaw === "") {
    return { secure: productionDefault, forcedInProduction: false };
  }
  const requested = parseBoolean(cookieSecureRaw, productionDefault);
  if (requested) {
    return { secure: true, forcedInProduction: false };
  }
  if (nodeEnv === "production") {
    return { secure: true, forcedInProduction: true };
  }
  return { secure: false, forcedInProduction: false };
}

/**
 * App runtime DB URL: prefer DATABASE_RUNTIME_URL (dang_runtime / NOBYPASSRLS)
 * when set and non-empty after trim; otherwise DATABASE_URL (prod-safe fallback).
 * Migrate/seed tooling must keep reading DATABASE_URL (dang_migrator) directly.
 */
export function resolveRuntimeDatabaseUrl(
  partial: EnvBag = readEnv(),
): string | undefined {
  const runtime = partial.DATABASE_RUNTIME_URL?.trim();
  if (runtime) return runtime;
  return partial.DATABASE_URL;
}

export function loadAppEnv(partial: EnvBag = readEnv()): AppEnv {
  const rawNodeEnv = partial.NODE_ENV ?? "development";
  const nodeEnv =
    rawNodeEnv === "production" || rawNodeEnv === "test" || rawNodeEnv === "development"
      ? rawNodeEnv
      : "development";

  const cookie = resolveCookieSecure(nodeEnv, partial.COOKIE_SECURE);

  return {
    nodeEnv,
    webOrigin: partial.WEB_ORIGIN ?? "http://localhost:3005",
    apiPort: Number(partial.API_PORT ?? "3006"),
    apiBaseUrl: partial.API_BASE_URL ?? "http://localhost:3006/api/v1",
    databaseUrl: resolveRuntimeDatabaseUrl(partial),
    redisUrl: partial.REDIS_URL,
    oidcIssuerUrl: partial.OIDC_ISSUER_URL || undefined,
    oidcClientId: partial.OIDC_CLIENT_ID || undefined,
    oidcClientSecret: partial.OIDC_CLIENT_SECRET || undefined,
    allowDevAuth: parseBoolean(
      partial.ALLOW_DEV_AUTH,
      nodeEnv === "development" || nodeEnv === "test",
    ),
    requireMfa: parseBoolean(partial.REQUIRE_MFA, nodeEnv === "production"),
    requireEmailVerification: parseBoolean(
      partial.REQUIRE_EMAIL_VERIFICATION,
      nodeEnv === "production",
    ),
    sessionSecret:
      partial.SESSION_SECRET ||
      (nodeEnv === "production"
        ? ""
        : "dev-only-session-secret-change-me"),
    attachmentBlobDir: partial.ATTACHMENT_BLOB_DIR || undefined,
    smtpUrl: partial.SMTP_URL || undefined,
    smtpFrom: partial.SMTP_FROM || undefined,
    zarinpalMerchantId: partial.ZARINPAL_MERCHANT_ID || undefined,
    zarinpalCallbackUrl: partial.ZARINPAL_CALLBACK_URL || undefined,
    cookieSecure: cookie.secure,
  };
}

/**
 * Group-space writes require a verified email only when this environment
 * enforces it. allowDevAuth (default in development and test) skips the gate.
 */
export function groupEmailVerificationEnforced(
  env: Pick<AppEnv, "allowDevAuth" | "requireEmailVerification">,
): boolean {
  if (env.allowDevAuth) return false;
  return env.requireEmailVerification;
}

export function isOidcConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.oidcIssuerUrl && env.oidcClientId);
}

export function isSmtpConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.smtpUrl);
}

export function isPaymentProviderConfigured(_env: AppEnv = loadAppEnv()): boolean {
  /** LocalPSP is always available; Zarinpal is optional. */
  return true;
}

export function isRedisConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.redisUrl);
}

export function requireDatabaseUrl(env: AppEnv = loadAppEnv()): string {
  return requireString("DATABASE_URL", env.databaseUrl);
}

const WEAK_SESSION_SECRETS = new Set([
  "",
  "dev-only-session-secret-change-me",
  "change-me",
  "secret",
  "session-secret",
  "changeme",
]);

/**
 * Fail-closed production boot: weak SESSION_SECRET or ALLOW_DEV_AUTH must not ship.
 * Exported for unit tests.
 */
export function assertProductionBootSafety(env: AppEnv = loadAppEnv()): void {
  if (env.nodeEnv !== "production") return;
  const secret = (env.sessionSecret ?? "").trim();
  if (!secret || WEAK_SESSION_SECRETS.has(secret) || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be a strong unique value (≥32 chars) in production",
    );
  }
  if (env.allowDevAuth) {
    throw new Error("ALLOW_DEV_AUTH must be false in production");
  }
}

/**
 * Public support inbox from env — never invent @dang.local.
 * Rejects empty and *.local placeholders.
 */
export function resolveSupportContactEmail(
  bag: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = (bag.CONTACT_INBOX ?? bag.SUPPORT_EMAIL ?? "").trim();
  if (!raw) return null;
  if (/\.local$/i.test(raw) || /@dang\.local$/i.test(raw)) return null;
  if (!raw.includes("@")) return null;
  return raw;
}

export * from "./integrations.js";
