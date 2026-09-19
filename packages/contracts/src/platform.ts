import type { PlatformRole } from "./account.js";
import type { OutboxRelayStats } from "./outbox.js";
import type { ProductFeatureFlags } from "./product-flags.js";
import type { SecurityEvent } from "./security-events.js";

/** Max break-glass window (DOMAIN-MODEL S11-13). */
export const PLATFORM_BREAK_GLASS_MAX_MINUTES = 240;

export type PlatformUserSummary = {
  userId: string;
  email?: string;
  username?: string;
  displayName: string;
  platformRole: PlatformRole;
  disabledAt?: string | null;
  createdAt: string;
};

export type PlatformUsersPage = {
  items: PlatformUserSummary[];
  nextCursor?: string;
};

export type PlatformSetRoleRequest = {
  platformRole: PlatformRole;
  /**
   * When elevating to platform_owner under maker-checker, pass the pending id
   * returned from the first request so a second owner can confirm.
   */
  confirmPendingId?: string;
};

export type PlatformSetRoleResponse = {
  user: PlatformUserSummary;
  /** Present when elevation is staged pending a second owner. */
  pendingId?: string;
  status: "applied" | "pending_second_owner";
};

export type PlatformPasswordResetResponse = {
  ok: true;
  /** Only when allowDevAuth and mailer returns a debug URL. */
  debugResetUrl?: string;
};

export type PlatformDisableUserRequest = {
  reason?: string;
};

export type PlatformFlagsResponse = {
  productFlags: ProductFeatureFlags;
  /** Env keys that back each flag — honest mapping, not decorative. */
  envKeys: Record<keyof ProductFeatureFlags, string>;
};

export type PlatformSecurityEventsPage = {
  items: SecurityEvent[];
  nextCursor?: string;
};

/**
 * GET /platform/outbox/stats — honest relay gauges.
 * `stats` is null when the store cannot read aggregates (never invent zeros).
 */
export type PlatformOutboxStatsResponse = {
  persistence: "memory" | "postgres";
  stats: OutboxRelayStats | null;
};

export type PlatformBreakGlassOpenRequest = {
  workspaceId: string;
  reason: string;
  expiresInMinutes: number;
  ticketRef?: string;
};

export type PlatformBreakGlassRecord = {
  id: string;
  actorUserId: string;
  workspaceId: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  ticketRef?: string | null;
  active: boolean;
};

export type PlatformBreakGlassListResponse = {
  items: PlatformBreakGlassRecord[];
  nextCursor?: string;
};
