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
  /** Session cookie secret (dev default is insecure; set SESSION_SECRET in prod). */
  sessionSecret: string;
  /** Local directory for attachment binary blobs (optional). */
  attachmentBlobDir?: string;
  /** SMTP URL e.g. smtp://user:pass@host:587 — enables real email delivery. */
  smtpUrl?: string;
  smtpFrom?: string;
  /** PSP merchant id (Zarinpal). Live only with ZARINPAL_ENABLED=1. */
  zarinpalMerchantId?: string;
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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function loadAppEnv(partial: EnvBag = readEnv()): AppEnv {
  const rawNodeEnv = partial.NODE_ENV ?? "development";
  const nodeEnv =
    rawNodeEnv === "production" || rawNodeEnv === "test" || rawNodeEnv === "development"
      ? rawNodeEnv
      : "development";

  return {
    nodeEnv,
    webOrigin: partial.WEB_ORIGIN ?? "http://localhost:3005",
    apiPort: Number(partial.API_PORT ?? "3006"),
    apiBaseUrl: partial.API_BASE_URL ?? "http://localhost:3006/api/v1",
    databaseUrl: partial.DATABASE_URL,
    redisUrl: partial.REDIS_URL,
    oidcIssuerUrl: partial.OIDC_ISSUER_URL || undefined,
    oidcClientId: partial.OIDC_CLIENT_ID || undefined,
    oidcClientSecret: partial.OIDC_CLIENT_SECRET || undefined,
    allowDevAuth: parseBoolean(
      partial.ALLOW_DEV_AUTH,
      nodeEnv === "development" || nodeEnv === "test",
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
  };
}

export function isOidcConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.oidcIssuerUrl && env.oidcClientId);
}

export function isSmtpConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.smtpUrl);
}

export function isPaymentProviderConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.zarinpalMerchantId);
}

export function isRedisConfigured(env: AppEnv = loadAppEnv()): boolean {
  return Boolean(env.redisUrl);
}

export function requireDatabaseUrl(env: AppEnv = loadAppEnv()): string {
  return requireString("DATABASE_URL", env.databaseUrl);
}

export * from "./integrations.js";
