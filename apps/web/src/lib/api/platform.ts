import type {
  PlatformBreakGlassListResponse,
  PlatformBreakGlassOpenRequest,
  PlatformBreakGlassRecord,
  PlatformDisableUserRequest,
  PlatformFlagsResponse,
  PlatformOutboxStatsResponse,
  PlatformPasswordResetResponse,
  PlatformSecurityEventsPage,
  PlatformSetRoleRequest,
  PlatformSetRoleResponse,
  PlatformSloResponse,
  PlatformUsersPage,
  PlatformUserSummary,
} from "@dang/contracts";
import { apiFetch } from "./client";

export const platformApi = {
  listUsers: (params?: { q?: string; cursor?: string }) => {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.cursor) q.set("cursor", params.cursor);
    const suffix = q.toString() ? `?${q}` : "";
    return apiFetch<PlatformUsersPage>(`/platform/users${suffix}`);
  },
  setUserRole: (uid: string, body: PlatformSetRoleRequest) =>
    apiFetch<PlatformSetRoleResponse>(`/platform/users/${encodeURIComponent(uid)}/role`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  passwordReset: (uid: string) =>
    apiFetch<PlatformPasswordResetResponse>(
      `/platform/users/${encodeURIComponent(uid)}/password-reset`,
      { method: "POST", body: "{}" },
    ),
  disableUser: (uid: string, body: PlatformDisableUserRequest = {}) =>
    apiFetch<PlatformUserSummary>(`/platform/users/${encodeURIComponent(uid)}/disable`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  flags: () => apiFetch<PlatformFlagsResponse>("/platform/flags"),
  slo: () => apiFetch<PlatformSloResponse>("/platform/slo"),
  outboxStats: () => apiFetch<PlatformOutboxStatsResponse>("/platform/outbox/stats"),
  outboxRedrive: (limit = 25) =>
    apiFetch<{
      persistence: "memory" | "postgres";
      attempted: number;
      processed: number;
      failed: number;
    }>(`/platform/outbox/redrive?limit=${encodeURIComponent(String(limit))}`, {
      method: "POST",
      body: "{}",
    }),
  securityEvents: (params?: {
    cursor?: string;
    category?: string;
    severity?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.cursor) q.set("cursor", params.cursor);
    if (params?.category) q.set("category", params.category);
    if (params?.severity) q.set("severity", params.severity);
    const suffix = q.toString() ? `?${q}` : "";
    return apiFetch<PlatformSecurityEventsPage>(`/platform/security-events${suffix}`);
  },
  listBreakGlass: (cursor?: string) => {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return apiFetch<PlatformBreakGlassListResponse>(`/platform/break-glass${q}`);
  },
  openBreakGlass: (body: PlatformBreakGlassOpenRequest) =>
    apiFetch<PlatformBreakGlassRecord>("/platform/break-glass", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeBreakGlass: (bid: string) =>
    apiFetch<PlatformBreakGlassRecord>(
      `/platform/break-glass/${encodeURIComponent(bid)}/revoke`,
      { method: "POST", body: "{}" },
    ),
  retentionDryRun: () =>
    apiFetch<{
      statementBodies: number;
      attachmentBlobs: number;
      ranAt: string;
      dryRun: boolean;
    }>("/system/retention/dry-run"),
};
