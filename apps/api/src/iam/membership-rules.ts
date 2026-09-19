import { isFinanceManagerRole, type MembershipRole } from "@dang/contracts";
import { MEMBERSHIP_MANAGER_ROLES } from "./iam.types.js";

export type MemberLike = {
  userId: string;
  role: MembershipRole;
  disabledAt?: string | null;
};

export function isActiveMember(m: MemberLike): boolean {
  return !m.disabledAt;
}

export function isMembershipManager(role: MembershipRole): boolean {
  return MEMBERSHIP_MANAGER_ROLES.includes(role);
}

/** True when demoting/disabling `targetUserId` would leave zero active finance managers. */
export function wouldRemoveLastFinanceManager(
  members: readonly MemberLike[],
  targetUserId: string,
  opts: { nextRole?: MembershipRole; disabling?: boolean },
): boolean {
  const target = members.find((m) => m.userId === targetUserId);
  if (!target || !isActiveMember(target) || !isFinanceManagerRole(target.role)) {
    return false;
  }
  const otherFinance = members.filter(
    (m) =>
      m.userId !== targetUserId &&
      isActiveMember(m) &&
      isFinanceManagerRole(m.role),
  );
  if (otherFinance.length > 0) return false;
  if (opts.disabling) return true;
  if (opts.nextRole !== undefined && !isFinanceManagerRole(opts.nextRole)) {
    return true;
  }
  return false;
}

export const ASSIGNABLE_MEMBER_ROLES: MembershipRole[] = [
  "admin",
  "finance",
  "deputy_finance",
  "approver",
  "buyer",
  "asset_custodian",
  "member",
  "auditor",
  "guest",
];
