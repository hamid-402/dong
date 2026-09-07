import { markClientSession, setDevIdentity, type AuthClientMode } from "@/lib/api";

/** Only allow in-app relative paths after auth (block open redirects). */
export function safeAppPath(next: string | null | undefined, fallback = "/spaces"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallback;
  }
  if (trimmed.startsWith("/login") || trimmed.startsWith("/register")) {
    return fallback;
  }
  return trimmed;
}

/** Mark browser session after password/OIDC/MFA success. */
export function completeClientAuth(
  mode: AuthClientMode,
  actor: { externalSubject: string; displayName: string },
): void {
  markClientSession(mode);
  setDevIdentity(actor.externalSubject, actor.displayName);
}
