/**
 * Workspace role grants + locked actions (S11-04).
 * Evaluation order: locked → member override → role grant → RBAC/ABAC default.
 */

import type { AccessAction } from "./access-abac.js";

export type GrantEffect = "allow" | "deny";

export type AccessGrant = {
  action: string;
  effect: GrantEffect;
};

/** Actions that cannot be granted/denied via workspace grants. */
export const LOCKED_ACCESS_ACTIONS = [
  "member.create_user_account",
  "workspace.transfer_ownership",
  "permission.grant_edit",
  "audit.delete",
  "audit.mutate",
] as const;

export type LockedAccessAction = (typeof LOCKED_ACCESS_ACTIONS)[number];

export function isLockedAccessAction(action: string): boolean {
  return (LOCKED_ACCESS_ACTIONS as readonly string[]).includes(action);
}

export type GrantResolutionSource =
  | "locked"
  | "member_override"
  | "role_grant"
  | "rbac_default";

export type GrantResolution = {
  allowed: boolean;
  source: GrantResolutionSource;
  effect?: GrantEffect;
};

/**
 * Resolve grant layers before RBAC default.
 * Returns null when no grant layer decides — caller falls through to ABAC/RBAC.
 */
export function resolveGrantLayers(input: {
  action: string;
  memberOverrides?: readonly AccessGrant[];
  roleGrants?: readonly AccessGrant[];
}): GrantResolution | null {
  if (isLockedAccessAction(input.action)) {
    // Locked actions are never grantable; allow/deny stays with core RBAC/ABAC.
    return null;
  }
  const member = input.memberOverrides?.find((g) => g.action === input.action);
  if (member) {
    return {
      allowed: member.effect === "allow",
      source: "member_override",
      effect: member.effect,
    };
  }
  const role = input.roleGrants?.find((g) => g.action === input.action);
  if (role) {
    return {
      allowed: role.effect === "allow",
      source: "role_grant",
      effect: role.effect,
    };
  }
  return null;
}

export function isDeputyWindowActive(input: {
  startsAt: string | Date;
  endsAt: string | Date;
  revokedAt?: string | Date | null;
  nowMs?: number;
}): boolean {
  if (input.revokedAt) return false;
  const now = input.nowMs ?? Date.now();
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  return now >= start && now <= end;
}

/** ABAC actions that may appear in grant UI (non-locked). */
export const GRANTABLE_ACCESS_ACTIONS: readonly AccessAction[] = [
  "workspace.mutate",
  "expense.read_private",
  "expense.approve",
  "settlement.confirm",
  "invite.create",
  "saas.invoice.manage",
  "jobs.dlq",
  "statement.read_any",
  "statement.export",
  "payout.manage",
];
