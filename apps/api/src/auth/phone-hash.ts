import { createHash } from "node:crypto";
import { loadAppEnv } from "@dang/config";

/**
 * Optional vault-backed session pepper (R10-06 local vault).
 * Set by KeyVaultService when unsealed; cleared on seal.
 */
let sessionPepperResolver: (() => string) | null = null;

export function setSessionPepperResolver(resolver: (() => string) | null): void {
  sessionPepperResolver = resolver;
}

/**
 * Hash a normalized E.164 phone for contact matching.
 * Uses SESSION_SECRET (or vault session_secret) as pepper so raw contact uploads are never stored.
 */
export function hashPhoneE164(phoneE164: string): string {
  const pepper =
    sessionPepperResolver?.() ||
    loadAppEnv().sessionSecret ||
    "dev-only-session-secret-change-me";
  return createHash("sha256").update(`${pepper}|${phoneE164}`).digest("hex");
}
