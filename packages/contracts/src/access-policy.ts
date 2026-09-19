/**
 * Central named role sets for workspace authorization (R10-05 برش سیاست).
 * Not a full ABAC engine — single source for hot-path role arrays across API/web.
 */

export const WORKSPACE_ADMIN_ROLES = ["owner", "admin"] as const;

/** Owner/admin — Jobs DLQ, invites, workspace settings. */
export const JOBS_DLQ_ROLES = WORKSPACE_ADMIN_ROLES;
export const INVITE_ADMIN_ROLES = WORKSPACE_ADMIN_ROLES;

/** Owner/admin/finance — range locks, partnership manage (same as finance managers). */
export const RANGE_LOCK_ROLES = ["owner", "admin", "finance"] as const;
export const PARTNERSHIP_MANAGER_ROLES = RANGE_LOCK_ROLES;
/** Owner/admin/finance — outbound webhook manage (G15 depth). */
export const WEBHOOK_MANAGER_ROLES = RANGE_LOCK_ROLES;

/** Owner/admin/finance/approver — company expense post, approval queue. */
export const EXPENSE_APPROVER_ROLES = [
  "owner",
  "admin",
  "finance",
  "approver",
] as const;
export const COMPANY_EXPENSE_POST_ROLES = EXPENSE_APPROVER_ROLES;

/** Procurement create/buy path. */
export const PROCUREMENT_BUYER_ROLES = [
  "owner",
  "admin",
  "buyer",
  "finance",
] as const;

/** Procurement approve path. */
export const PROCUREMENT_APPROVER_ROLES = [
  "owner",
  "admin",
  "finance",
  "approver",
] as const;

/** Assets custody / receive. */
export const ASSET_MANAGER_ROLES = [
  "owner",
  "admin",
  "buyer",
  "asset_custodian",
] as const;

export function roleInSet(
  role: string | null | undefined,
  allowed: readonly string[],
): boolean {
  return typeof role === "string" && allowed.includes(role);
}

export function isWorkspaceAdminRole(
  role: string | null | undefined,
): boolean {
  return roleInSet(role, WORKSPACE_ADMIN_ROLES);
}

export function canManageJobsDlq(
  role: string | null | undefined,
): boolean {
  return roleInSet(role, JOBS_DLQ_ROLES);
}
