import { isFinanceManagerRole, type MembershipRole } from "@dang/contracts";
import type { IamStore } from "../iam/iam.types.js";

/** Resolve private-expense elevation for مادرخرج / مدیر مالی. */
export async function resolveExpenseListOptions(
  iam: IamStore,
  workspaceId: string,
  userId: string,
): Promise<{ viewAllPrivate: boolean; role: MembershipRole | null }> {
  const members = (await iam.listMembers(workspaceId, userId)) ?? [];
  const role = members.find((m) => m.userId === userId)?.role ?? null;
  return { viewAllPrivate: isFinanceManagerRole(role), role };
}
