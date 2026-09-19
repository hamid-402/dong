/**
 * Structured security event taxonomy for SIEM hooks (R10-15).
 * Emitted as JSON logs and persisted to memory ring / ops.security_event.
 */

export type SecurityEventSeverity = "info" | "low" | "medium" | "high" | "critical";

export type SecurityEventCategory =
  | "auth"
  | "access"
  | "fraud"
  | "privacy"
  | "integrity"
  | "ops";

export type SecurityEventName =
  | "auth.login_failed"
  | "auth.rate_limited"
  | "auth.password_changed"
  | "auth.session_revoked"
  | "auth.sessions_revoked"
  | "auth.mfa_disabled"
  | "auth.mfa_enabled"
  | "auth.mfa_challenge_failed"
  | "auth.account_anonymized"
  | "auth.reauth_ok"
  | "auth.reauth_failed"
  | "access.maker_checker_denied"
  | "access.policy_denied"
  | "access.break_glass_opened"
  | "access.break_glass_revoked"
  | "fraud.settlement_anomaly"
  | "fraud.invite_anomaly"
  | "privacy.data_exported"
  | "privacy.payout_destination_updated"
  | "privacy.payout_destination_cleared";

export type SecurityEvent = {
  /** Stable id for cursor pagination (memory + Postgres). */
  id: string;
  event: SecurityEventName;
  category: SecurityEventCategory;
  severity: SecurityEventSeverity;
  occurredAt: string;
  workspaceId?: string;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  requestId?: string;
  traceId?: string;
  /** Non-PII attributes only. */
  attrs?: Record<string, string | number | boolean | null>;
};

export type SecurityEventListQuery = {
  cursor?: string;
  limit?: number;
  category?: SecurityEventCategory;
  severity?: SecurityEventSeverity;
  /** When set, only events for this workspace (workspace-scoped listings). */
  workspaceId?: string;
};

export type SecurityEventListPage = {
  items: SecurityEvent[];
  nextCursor?: string;
};

export function securityEventDefaults(
  name: SecurityEventName,
): Pick<SecurityEvent, "category" | "severity"> {
  switch (name) {
    case "auth.login_failed":
      return { category: "auth", severity: "medium" };
    case "auth.rate_limited":
      return { category: "auth", severity: "high" };
    case "auth.password_changed":
      return { category: "auth", severity: "high" };
    case "auth.session_revoked":
      return { category: "auth", severity: "medium" };
    case "auth.sessions_revoked":
      return { category: "auth", severity: "high" };
    case "auth.mfa_disabled":
      return { category: "auth", severity: "high" };
    case "auth.mfa_enabled":
      return { category: "auth", severity: "medium" };
    case "auth.mfa_challenge_failed":
      return { category: "auth", severity: "medium" };
    case "auth.account_anonymized":
      return { category: "privacy", severity: "high" };
    case "auth.reauth_ok":
      return { category: "auth", severity: "info" };
    case "auth.reauth_failed":
      return { category: "auth", severity: "medium" };
    case "access.maker_checker_denied":
      return { category: "access", severity: "high" };
    case "access.policy_denied":
      return { category: "access", severity: "medium" };
    case "access.break_glass_opened":
      return { category: "access", severity: "critical" };
    case "access.break_glass_revoked":
      return { category: "access", severity: "high" };
    case "fraud.settlement_anomaly":
      return { category: "fraud", severity: "high" };
    case "fraud.invite_anomaly":
      return { category: "fraud", severity: "high" };
    case "privacy.data_exported":
      return { category: "privacy", severity: "info" };
    case "privacy.payout_destination_updated":
      return { category: "privacy", severity: "medium" };
    case "privacy.payout_destination_cleared":
      return { category: "privacy", severity: "medium" };
    default:
      return { category: "ops", severity: "info" };
  }
}

/** Encode opaque list cursor from (occurredAt, id). */
export function encodeSecurityEventCursor(occurredAt: string, id: string): string {
  const json = JSON.stringify({ t: occurredAt, id });
  return base64UrlEncode(json);
}

export function decodeSecurityEventCursor(
  cursor: string | undefined,
): { t: string; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const raw = base64UrlDecode(cursor.trim());
    const parsed = JSON.parse(raw) as { t?: unknown; id?: unknown };
    if (typeof parsed.t === "string" && typeof parsed.id === "string") {
      return { t: parsed.t, id: parsed.id };
    }
  } catch {
    /* legacy offset cursors fall through */
  }
  return null;
}

function base64UrlEncode(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
